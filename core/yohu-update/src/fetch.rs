//! 安装包下载编排：拼 `DownloadSpec`、GitHub 头、进度映射。

use tokio_util::sync::CancellationToken;
use yohu_download::{fetch as http_fetch, DownloadPhase, DownloadSpec};
use yohu_protocol::{UpdateDownloadRequest, UpdateDownloadResult, UpdateProgress, UpdateStage};

use crate::cache::installer_dest;
use crate::credentials::load_github_source;
use crate::error::UpdateError;
use crate::github::GitHubReleaseSource;
use crate::platform::user_agent;
use crate::url_policy::{assert_http_url, authorization_header};

pub async fn download_installer(
    config_dir: &std::path::Path,
    request: UpdateDownloadRequest,
    cancel: CancellationToken,
    on_progress: impl FnMut(UpdateProgress),
) -> Result<UpdateDownloadResult, UpdateError> {
    download_installer_from(load_github_source(config_dir), request, cancel, on_progress).await
}

pub async fn download_installer_from(
    source: Result<GitHubReleaseSource, UpdateError>,
    request: UpdateDownloadRequest,
    cancel: CancellationToken,
    mut on_progress: impl FnMut(UpdateProgress),
) -> Result<UpdateDownloadResult, UpdateError> {
    let source = source?;
    let version = request.version.clone();
    let url = assert_http_url(&request.url)?.to_string();
    let dest = installer_dest(&url)?;
    let token = source.token;
    let mut headers = Vec::new();
    if let Some(h) = authorization_header(&url, &token) {
        headers.push(h);
    }
    let dest_path = dest.to_string_lossy().into_owned();
    let spec = DownloadSpec {
        url,
        dest,
        user_agent: user_agent(env!("CARGO_PKG_VERSION")),
        headers,
        expected_size: request.size_bytes,
        expected_sha256: request.sha256,
    };
    let outcome = http_fetch(spec, cancel, |p| {
        let stage = match p.phase {
            DownloadPhase::Streaming => UpdateStage::Downloading,
            DownloadPhase::Verifying => UpdateStage::Verifying,
            DownloadPhase::Complete => UpdateStage::Ready,
        };
        on_progress(UpdateProgress {
            version: version.clone(),
            stage,
            received_bytes: p.received,
            total_bytes: p.total,
            installer_path: (stage == UpdateStage::Ready).then(|| dest_path.clone()),
            message: None,
        });
    })
    .await
    .map_err(UpdateError::from)?;
    Ok(UpdateDownloadResult {
        path: outcome.path.to_string_lossy().into_owned(),
        size_bytes: outcome.size_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::github::GitHubReleaseSource;
    use yohu_download::sha256_hex;

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

    #[tokio::test]
    async fn non_github_url_does_not_send_authorization() {
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
                "must not attach token to non-GitHub hosts"
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
        let result = download_installer(
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

    #[tokio::test]
    async fn download_with_token_via_github_host() {
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
                "127.0.0.1 is not a GitHub host"
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
        let result = download_installer_from(
            Ok(source_with_token("secret-must-not-leak")),
            request(&url, &sha, body.len() as u64, "1.2.0"),
            CancellationToken::new(),
            |progress| versions.push(progress.version.clone()),
        )
        .await
        .unwrap();
        assert_eq!(tokio::fs::read(&result.path).await.unwrap(), body);
        assert!(versions.iter().all(|v| v == "1.2.0"));
        let _ = tokio::fs::remove_file(&result.path).await;
    }
}
