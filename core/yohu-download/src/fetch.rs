//! 带退避重试的下载编排。

use std::time::Duration;

use tokio_util::sync::CancellationToken;

use crate::error::DownloadError;
use crate::resume::partial_path;
use crate::spec::{DownloadOutcome, DownloadProgress, DownloadSpec};
use crate::stream::stream_once;

pub const DOWNLOAD_ATTEMPTS: u32 = 4;
const BACKOFF_BASE_MS: u64 = 500;

pub async fn fetch(
    spec: DownloadSpec,
    cancel: CancellationToken,
    mut on_progress: impl FnMut(DownloadProgress),
) -> Result<DownloadOutcome, DownloadError> {
    let mut delay = BACKOFF_BASE_MS;
    let mut last_err = None;
    for attempt in 1..=DOWNLOAD_ATTEMPTS {
        if cancel.is_cancelled() {
            return Err(DownloadError::Cancelled);
        }
        match stream_once(&spec, &cancel, &mut on_progress).await {
            Ok(out) => return Ok(out),
            Err(e @ DownloadError::Cancelled)
            | Err(e @ DownloadError::ChecksumMismatch)
            | Err(e @ DownloadError::SizeMismatch)
            | Err(e @ DownloadError::TooLarge)
            | Err(e @ DownloadError::InvalidUrl) => return Err(e),
            Err(e @ DownloadError::Http(code))
                if !(500..=599).contains(&code) && code != 408 && code != 429 =>
            {
                return Err(e);
            }
            Err(e) => {
                tracing::warn!(attempt, error = %e, "download attempt failed");
                last_err = Some(e);
                if attempt == DOWNLOAD_ATTEMPTS {
                    break;
                }
                let part = partial_path(&spec.dest);
                let _ = tokio::fs::remove_file(&part).await;
                tokio::select! {
                    biased;
                    _ = cancel.cancelled() => return Err(DownloadError::Cancelled),
                    _ = tokio::time::sleep(Duration::from_millis(delay)) => {}
                }
                delay = delay.saturating_mul(2);
            }
        }
    }
    Err(last_err.expect("DOWNLOAD_ATTEMPTS >= 1"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::DownloadError;
    use crate::policy::assert_http_url;
    use crate::verify::sha256_hex;
    #[tokio::test]
    async fn local_http_roundtrip() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let body = b"download-engine-bytes";
        let sha = sha256_hex(body);
        tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let mut buf = vec![0u8; 2048];
            let _ = sock.read(&mut buf).await;
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = sock.write_all(header.as_bytes()).await;
            let _ = sock.write_all(body).await;
        });
        let url = format!("http://{addr}/pkg.bin");
        assert_http_url(&url).unwrap();
        let dest = std::env::temp_dir().join(format!("yohu-dl-{}-pkg.bin", std::process::id()));
        let _ = tokio::fs::remove_file(&dest).await;
        let spec = DownloadSpec {
            url,
            dest: dest.clone(),
            user_agent: "YohuDownload/test".into(),
            headers: vec![],
            expected_size: body.len() as u64,
            expected_sha256: sha,
            allowed_hosts: Vec::new(),
        };
        let out = fetch(spec, CancellationToken::new(), |_| {}).await.unwrap();
        assert_eq!(out.path, dest);
        assert_eq!(tokio::fs::read(&dest).await.unwrap(), body);
        let _ = tokio::fs::remove_file(&dest).await;
    }

    #[test]
    fn allowlist_rejects_a_different_host() {
        use crate::stream::final_host_allowed;
        let cisco = vec!["ciscobinary.openh264.org".to_string()];
        assert!(final_host_allowed(Some("ciscobinary.openh264.org"), &cisco));
        assert!(!final_host_allowed(Some("example.com"), &cisco));
        assert!(!final_host_allowed(None, &cisco));
        assert!(final_host_allowed(Some("example.com"), &[]));
    }

    #[tokio::test]
    async fn redirect_off_the_allowlist_does_not_write() {
        let foreign = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let foreign_addr = foreign.local_addr().unwrap();
        let body = b"should-not-land";
        tokio::spawn(async move {
            let (mut sock, _) = foreign.accept().await.unwrap();
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let mut buf = vec![0u8; 2048];
            let _ = sock.read(&mut buf).await;
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = sock.write_all(header.as_bytes()).await;
            let _ = sock.write_all(body).await;
        });

        let gate = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let gate_addr = gate.local_addr().unwrap();
        let location = format!("http://{foreign_addr}/pkg.bin");
        tokio::spawn(async move {
            let (mut sock, _) = gate.accept().await.unwrap();
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let mut buf = vec![0u8; 2048];
            let _ = sock.read(&mut buf).await;
            let header = format!(
                "HTTP/1.1 302 Found\r\nLocation: {location}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            );
            let _ = sock.write_all(header.as_bytes()).await;
        });

        let dest =
            std::env::temp_dir().join(format!("yohu-dl-{}-redirect.bin", std::process::id()));
        let _ = tokio::fs::remove_file(&dest).await;
        let spec = DownloadSpec {
            url: format!("http://{gate_addr}/start"),
            dest: dest.clone(),
            user_agent: "YohuDownload/test".into(),
            headers: vec![],
            expected_size: body.len() as u64,
            expected_sha256: "unused".into(),
            allowed_hosts: vec!["ciscobinary.openh264.org".into()],
        };
        let err = fetch(spec, CancellationToken::new(), |_| {})
            .await
            .unwrap_err();
        assert_eq!(err, DownloadError::InvalidUrl);
        assert!(!tokio::fs::try_exists(&dest).await.unwrap());
    }
}
