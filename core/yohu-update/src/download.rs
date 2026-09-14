//! HTTP 流：把安装包下到缓存，边写边做 SHA-256。
//!
//! 公开入口在 crate 根：`download_configured` / `download_with_github`。
//! 本文件只做流式写入；Authorization 必须先过 GitHub 主机判定。

use std::time::{Duration, Instant};

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;
use yohu_protocol::{UpdateDownloadResult, UpdateProgress, UpdateStage};

use crate::cache::installer_dest;
use crate::error::UpdateError;
use crate::url_policy::{assert_http_url, github_bearer_token};
use crate::verify::{hex_lower, sha256_hex, sha256_matches, MAX_INSTALLER_BYTES};

const PROGRESS_INTERVAL: Duration = Duration::from_millis(200);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

/// 下载安装包到缓存目录；已存在且校验通过则跳过网络。
///
/// `token` 只在 GitHub 主机上进入 Authorization；调用方不得绕过主机判定。
pub(crate) async fn stream_installer(
    url: &str,
    expected_sha256: &str,
    expected_size: u64,
    token: &str,
    user_agent: &str,
    cancel: CancellationToken,
    mut on_progress: impl FnMut(UpdateProgress),
) -> Result<UpdateDownloadResult, UpdateError> {
    let url = assert_http_url(url)?.to_string();
    if expected_size > MAX_INSTALLER_BYTES {
        return Err(UpdateError::TooLarge);
    }
    let dest = installer_dest(&url)?;
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| UpdateError::Io(e.to_string()))?;
    }

    if dest.is_file() {
        if let Ok(existing) = tokio::fs::read(&dest).await {
            let actual = sha256_hex(&existing);
            let size_ok = expected_size == 0 || existing.len() as u64 == expected_size;
            if size_ok && sha256_matches(expected_sha256, &actual) {
                let size = existing.len() as u64;
                on_progress(UpdateProgress {
                    version: String::new(),
                    stage: UpdateStage::Ready,
                    received_bytes: size,
                    total_bytes: size,
                });
                return Ok(UpdateDownloadResult {
                    path: dest.to_string_lossy().into_owned(),
                    size_bytes: size,
                });
            }
        }
        let _ = tokio::fs::remove_file(&dest).await;
    }

    let client = reqwest::Client::builder()
        .timeout(DOWNLOAD_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|e| UpdateError::Network(e.to_string()))?;
    let req = apply_download_headers(client.get(&url), &url, token, user_agent);
    let response = tokio::select! {
        biased;
        _ = cancel.cancelled() => return Err(UpdateError::Cancelled),
        sent = req.send() => sent?,
    };
    let status = response.status();
    if !status.is_success() {
        return Err(UpdateError::Http(status.as_u16()));
    }
    let header_len = response.content_length().unwrap_or(0);
    let total = if expected_size > 0 {
        expected_size
    } else {
        header_len
    };
    if total > MAX_INSTALLER_BYTES {
        return Err(UpdateError::TooLarge);
    }

    let part = dest.with_file_name(format!(
        "{}.part",
        dest.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "installer.part".into())
    ));
    if part.exists() {
        let _ = tokio::fs::remove_file(&part).await;
    }
    let mut file = tokio::fs::File::create(&part)
        .await
        .map_err(|e| UpdateError::Io(e.to_string()))?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut last_emit = Instant::now() - PROGRESS_INTERVAL;
    let mut stream = response.bytes_stream();
    on_progress(UpdateProgress {
        version: String::new(),
        stage: UpdateStage::Downloading,
        received_bytes: 0,
        total_bytes: total,
    });

    loop {
        let chunk = tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                drop(file);
                let _ = tokio::fs::remove_file(&part).await;
                return Err(UpdateError::Cancelled);
            }
            next = stream.next() => next,
        };
        let Some(chunk) = chunk else {
            break;
        };
        let chunk = chunk?;
        received = received.saturating_add(chunk.len() as u64);
        if received > MAX_INSTALLER_BYTES || (expected_size > 0 && received > expected_size) {
            drop(file);
            let _ = tokio::fs::remove_file(&part).await;
            return Err(UpdateError::TooLarge);
        }
        hasher.update(&chunk);
        file.write_all(&chunk)
            .await
            .map_err(|e| UpdateError::Io(e.to_string()))?;
        if last_emit.elapsed() >= PROGRESS_INTERVAL {
            last_emit = Instant::now();
            on_progress(UpdateProgress {
                version: String::new(),
                stage: UpdateStage::Downloading,
                received_bytes: received,
                total_bytes: total,
            });
        }
    }
    file.flush()
        .await
        .map_err(|e| UpdateError::Io(e.to_string()))?;
    drop(file);

    on_progress(UpdateProgress {
        version: String::new(),
        stage: UpdateStage::Verifying,
        received_bytes: received,
        total_bytes: total.max(received),
    });
    if expected_size > 0 && received != expected_size {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(UpdateError::SizeMismatch);
    }
    let actual = hex_lower(&hasher.finalize());
    if !sha256_matches(expected_sha256, &actual) {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(UpdateError::ChecksumMismatch);
    }
    tokio::fs::rename(&part, &dest)
        .await
        .map_err(|e| UpdateError::Io(e.to_string()))?;
    on_progress(UpdateProgress {
        version: String::new(),
        stage: UpdateStage::Ready,
        received_bytes: received,
        total_bytes: received,
    });
    Ok(UpdateDownloadResult {
        path: dest.to_string_lossy().into_owned(),
        size_bytes: received,
    })
}

fn apply_download_headers(
    builder: reqwest::RequestBuilder,
    url: &str,
    token: &str,
    user_agent: &str,
) -> reqwest::RequestBuilder {
    let builder = builder.header("User-Agent", user_agent);
    match github_bearer_token(url, token) {
        Some(token) => builder.bearer_auth(token),
        None => builder,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::installer_dest;
    use crate::download_with_github;
    use crate::github::GitHubReleaseSource;
    use tokio_util::sync::CancellationToken;
    use yohu_protocol::UpdateDownloadRequest;

    fn source_with_token(token: &str) -> GitHubReleaseSource {
        GitHubReleaseSource::new("yohurm", "Windows-YoADBTools")
            .unwrap()
            .with_token(token)
    }

    fn request(url: &str, sha: &str, size: u64, version: &str) -> UpdateDownloadRequest {
        UpdateDownloadRequest {
            url: url.into(),
            sha256: sha.into(),
            size_bytes: size,
            version: version.into(),
        }
    }

    fn authorization(url: &str, token: &str) -> Option<String> {
        let client = reqwest::Client::new();
        let req = apply_download_headers(client.get(url), url, token, "YohuAdbTools/0.1.0")
            .build()
            .unwrap();
        req.headers()
            .get(reqwest::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string)
    }

    #[test]
    fn github_url_with_token_sets_authorization() {
        for url in [
            "https://github.com/yohurm/Windows-YoADBTools/releases/download/v1.0.0/YohuAdbTools_1.0.0_x64-setup.exe",
            "https://api.github.com/repos/o/r/releases/assets/1",
            "https://objects.githubusercontent.com/release-assets/1",
            "https://release-assets.githubusercontent.com/github-production-release-asset/1",
        ] {
            assert_eq!(
                authorization(url, "secret-pat").as_deref(),
                Some("Bearer secret-pat"),
                "{url}"
            );
        }
    }

    #[test]
    fn non_github_url_never_sets_authorization() {
        for url in [
            "https://cdn.example.com/YohuAdbTools_1.0.0_x64-setup.exe",
            "https://github.com.evil.com/YohuAdbTools_1.0.0_x64-setup.exe",
            "http://127.0.0.1:9/YohuAdbTools_1.0.0_x64-setup.exe",
        ] {
            assert_eq!(authorization(url, "secret-pat"), None, "{url}");
        }
    }

    #[tokio::test]
    async fn download_from_local_http_verifies_hash() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let body = b"nsis-setup-bytes";
        let sha = sha256_hex(body);
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let mut buf = vec![0u8; 2048];
            let n = sock.read(&mut buf).await.unwrap_or(0);
            let seen = String::from_utf8_lossy(&buf[..n]).to_ascii_lowercase();
            assert!(
                !seen.contains("authorization"),
                "non-GitHub URL must not send Authorization"
            );
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = sock.write_all(header.as_bytes()).await;
            let _ = sock.write_all(body).await;
        });
        let url = format!("http://{addr}/YohuAdbTools_test_x64-setup.exe");
        let dest = installer_dest(&url).expect("os app data root");
        let _ = tokio::fs::remove_file(&dest).await;
        let mut versions = Vec::new();
        let result = download_with_github(
            source_with_token("secret-must-not-leak"),
            request(&url, &sha, body.len() as u64, "1.2.0"),
            CancellationToken::new(),
            |progress| versions.push(progress.version.clone()),
        )
        .await
        .unwrap();
        assert_eq!(tokio::fs::read(&result.path).await.unwrap(), body);
        assert!(!versions.is_empty());
        assert!(versions.iter().all(|v| v == "1.2.0"));
        let _ = tokio::fs::remove_file(&result.path).await;
    }

    #[tokio::test]
    async fn download_configured_does_not_authorize_non_github_url() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let body = b"configured-setup-bytes";
        let sha = sha256_hex(body);
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let mut buf = vec![0u8; 2048];
            let n = sock.read(&mut buf).await.unwrap_or(0);
            let seen = String::from_utf8_lossy(&buf[..n]).to_ascii_lowercase();
            assert!(
                !seen.contains("authorization"),
                "download_configured must not attach token to non-GitHub hosts"
            );
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = sock.write_all(header.as_bytes()).await;
            let _ = sock.write_all(body).await;
        });
        let url = format!("http://{addr}/YohuAdbTools_configured_x64-setup.exe");
        let dest = installer_dest(&url).expect("os app data root");
        let _ = tokio::fs::remove_file(&dest).await;
        let root = std::env::temp_dir().join(format!(
            "yohu-update-dl-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(
            root.join("update.json"),
            r#"{"github":{"token":"file-pat-must-not-leak"}}"#,
        )
        .unwrap();
        let result = crate::download_configured(
            &root,
            request(&url, &sha, body.len() as u64, "1.2.0"),
            CancellationToken::new(),
            |_| {},
        )
        .await
        .unwrap();
        assert_eq!(tokio::fs::read(&result.path).await.unwrap(), body);
        let _ = tokio::fs::remove_file(&result.path).await;
        let _ = std::fs::remove_dir_all(&root);
    }
}
