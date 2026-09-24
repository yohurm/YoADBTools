//! 单次 HTTP 流写 `.part`。

use std::time::{Duration, Instant};

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

use crate::error::DownloadError;
use crate::policy::assert_http_url;
use crate::resume::{resume_plan, ResumeAction};
use crate::spec::{DownloadOutcome, DownloadPhase, DownloadProgress, DownloadSpec};
use crate::verify::{hex_lower, sha256_hex, sha256_matches, MAX_FILE_BYTES};

pub(crate) const PROGRESS_INTERVAL: Duration = Duration::from_millis(200);
pub(crate) const READ_TIMEOUT: Duration = Duration::from_secs(10 * 60);
pub(crate) const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

pub(crate) async fn stream_once(
    spec: &DownloadSpec,
    cancel: &CancellationToken,
    mut on_progress: impl FnMut(DownloadProgress),
) -> Result<DownloadOutcome, DownloadError> {
    let url = assert_http_url(&spec.url)?.to_string();
    if spec.expected_size > MAX_FILE_BYTES {
        return Err(DownloadError::TooLarge);
    }
    let dest = &spec.dest;
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| DownloadError::Io(e.to_string()))?;
    }

    if tokio::fs::metadata(dest)
        .await
        .map(|m| m.is_file())
        .unwrap_or(false)
    {
        if let Ok(existing) = tokio::fs::read(dest).await {
            let actual = sha256_hex(&existing);
            let size_ok = spec.expected_size == 0 || existing.len() as u64 == spec.expected_size;
            if size_ok && sha256_matches(&spec.expected_sha256, &actual) {
                let size = existing.len() as u64;
                on_progress(DownloadProgress {
                    received: size,
                    total: size,
                    phase: DownloadPhase::Complete,
                });
                return Ok(DownloadOutcome {
                    path: dest.clone(),
                    size_bytes: size,
                });
            }
        }
        let _ = tokio::fs::remove_file(dest).await;
    }

    let part = dest.with_file_name(format!(
        "{}.part",
        dest.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "file.part".into())
    ));
    let mut have: u64 = 0;
    if tokio::fs::try_exists(&part).await.unwrap_or(false) {
        have = tokio::fs::metadata(&part)
            .await
            .map(|m| m.len())
            .unwrap_or(0);
    }

    let client = reqwest::Client::builder()
        .timeout(READ_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|e| DownloadError::Network(e.to_string()))?;
    let mut req = client
        .get(&url)
        .header("User-Agent", &spec.user_agent)
        .header("Accept", "application/octet-stream");
    for (k, v) in &spec.headers {
        req = req.header(k.as_str(), v.as_str());
    }
    if have > 0 {
        req = req.header("Range", format!("bytes={have}-"));
    }
    let response = tokio::select! {
        biased;
        _ = cancel.cancelled() => return Err(DownloadError::Cancelled),
        sent = req.send() => sent?,
    };
    let status = response.status().as_u16();
    let action = if have > 0 {
        resume_plan(have, status)?
    } else if (200..300).contains(&status) {
        ResumeAction::Fresh
    } else {
        return Err(DownloadError::Http(status));
    };
    if !(200..300).contains(&status) {
        return Err(DownloadError::Http(status));
    }

    let header_len = response.content_length().unwrap_or(0);
    let mut total = if spec.expected_size > 0 {
        spec.expected_size
    } else if action == ResumeAction::AppendFrom(have) {
        have.saturating_add(header_len)
    } else {
        header_len
    };
    if total == 0 && spec.expected_size > 0 {
        total = spec.expected_size;
    }
    if total > MAX_FILE_BYTES {
        return Err(DownloadError::TooLarge);
    }

    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut file = match action {
        ResumeAction::Fresh => {
            let _ = tokio::fs::remove_file(&part).await;
            tokio::fs::File::create(&part)
                .await
                .map_err(|e| DownloadError::Io(e.to_string()))?
        }
        ResumeAction::AppendFrom(offset) => {
            let existing = tokio::fs::read(&part).await.map_err(|e| DownloadError::Io(e.to_string()))?;
            if existing.len() as u64 != offset {
                let _ = tokio::fs::remove_file(&part).await;
                return Err(DownloadError::SizeMismatch);
            }
            hasher.update(&existing);
            received = offset;
            tokio::fs::OpenOptions::new()
                .append(true)
                .open(&part)
                .await
                .map_err(|e| DownloadError::Io(e.to_string()))?
        }
    };
    let mut last_emit = Instant::now() - PROGRESS_INTERVAL;
    let mut stream = response.bytes_stream();
    on_progress(DownloadProgress {
        received,
        total,
        phase: DownloadPhase::Streaming,
    });

    loop {
        let chunk = tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                drop(file);
                let _ = tokio::fs::remove_file(&part).await;
                return Err(DownloadError::Cancelled);
            }
            next = stream.next() => next,
        };
        let Some(chunk) = chunk else {
            break;
        };
        let chunk = chunk?;
        received = received.saturating_add(chunk.len() as u64);
        if received > MAX_FILE_BYTES || (spec.expected_size > 0 && received > spec.expected_size) {
            drop(file);
            let _ = tokio::fs::remove_file(&part).await;
            return Err(DownloadError::TooLarge);
        }
        hasher.update(&chunk);
        file.write_all(&chunk)
            .await
            .map_err(|e| DownloadError::Io(e.to_string()))?;
        if last_emit.elapsed() >= PROGRESS_INTERVAL {
            last_emit = Instant::now();
            on_progress(DownloadProgress {
                received,
                total,
                phase: DownloadPhase::Streaming,
            });
        }
    }
    file.flush()
        .await
        .map_err(|e| DownloadError::Io(e.to_string()))?;
    drop(file);

    on_progress(DownloadProgress {
        received,
        total: total.max(received),
        phase: DownloadPhase::Verifying,
    });
    if spec.expected_size > 0 && received != spec.expected_size {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(DownloadError::SizeMismatch);
    }
    let actual = hex_lower(&hasher.finalize());
    if !sha256_matches(&spec.expected_sha256, &actual) {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(DownloadError::ChecksumMismatch);
    }
    tokio::fs::rename(&part, dest)
        .await
        .map_err(|e| DownloadError::Io(e.to_string()))?;
    on_progress(DownloadProgress {
        received,
        total: received,
        phase: DownloadPhase::Complete,
    });
    Ok(DownloadOutcome {
        path: dest.clone(),
        size_bytes: received,
    })
}
