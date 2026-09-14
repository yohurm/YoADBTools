//! yohu-update — 应用更新检查 / 下载 / 覆盖安装。
//!
//! 固定 GitHub Releases（`yohurm/Windows-YoADBTools`）。
//! 检查与下载同一条编排：各自 `load_github_source`，失败上抛；
//! Authorization 只打 GitHub 主机；UA 只在 `user_agent` 拼一次。
//! Windows：家园缓存 NSIS 后 `/S /UPDATE /NS` 覆盖；macOS：打开 DMG。
//! 不引入 tauri-plugin-updater。

mod apply;
mod artifact;
mod cache;
mod check;
mod contract;
mod credentials;
mod download;
mod error;
mod github;
mod platform;
mod release;
mod url_policy;
mod verify;

pub use apply::{installed_exe_path, spawn_overlay_install, NSIS_OVERLAY_ARGS};
pub use artifact::InstallerKind;
pub use cache::{assert_cached_installer, installer_dest, update_cache_dir};
pub use check::check_update;
pub use contract::UpdateCheckProvider;
pub use credentials::{describe_channel, load_github_source};
pub use error::UpdateError;
pub use github::{GitHubReleaseProvider, GitHubReleaseSource};
pub use platform::{user_agent, PlatformInfo};
pub use url_policy::assert_http_url;

use std::path::Path;

use tokio_util::sync::CancellationToken;
use yohu_protocol::{RemoteUpdate, UpdateDownloadRequest, UpdateDownloadResult, UpdateProgress};

/// 用 `config/update.json` / 环境变量补全仓库后检查 GitHub Releases。
pub async fn check_configured(
    config_dir: &Path,
    platform: PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    check_with_github(load_github_source(config_dir)?, platform).await
}

/// 用 GitHub Releases Provider 按平台信息检查更新。
pub async fn check_with_github(
    source: GitHubReleaseSource,
    platform: PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    let provider = GitHubReleaseProvider::new(source)?;
    check_update(&provider, &platform).await
}

/// 用 `config/update.json` / 环境变量补全仓库后下载安装包。
pub async fn download_configured(
    config_dir: &Path,
    request: UpdateDownloadRequest,
    cancel: CancellationToken,
    on_progress: impl FnMut(UpdateProgress),
) -> Result<UpdateDownloadResult, UpdateError> {
    download_configured_from(load_github_source(config_dir), request, cancel, on_progress).await
}

/// 用已解析的 GitHub 坐标下载安装包。
pub async fn download_with_github(
    source: GitHubReleaseSource,
    request: UpdateDownloadRequest,
    cancel: CancellationToken,
    on_progress: impl FnMut(UpdateProgress),
) -> Result<UpdateDownloadResult, UpdateError> {
    download_configured_from(Ok(source), request, cancel, on_progress).await
}

async fn download_configured_from(
    source: Result<GitHubReleaseSource, UpdateError>,
    request: UpdateDownloadRequest,
    cancel: CancellationToken,
    mut on_progress: impl FnMut(UpdateProgress),
) -> Result<UpdateDownloadResult, UpdateError> {
    let source = source?;
    let version = request.version.clone();
    let url = assert_http_url(&request.url)?;
    crate::download::stream_installer(
        url,
        &request.sha256,
        request.size_bytes,
        &source.token,
        &user_agent(env!("CARGO_PKG_VERSION")),
        cancel,
        move |mut progress| {
            progress.version = version.clone();
            on_progress(progress);
        },
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_protocol::UpdateDownloadRequest;

    #[tokio::test]
    async fn download_fails_when_github_source_fails() {
        let request = UpdateDownloadRequest {
            url: "https://example.com/YohuAdbTools_1.0.0_x64-setup.exe".into(),
            sha256: String::new(),
            size_bytes: 0,
            version: "1.0.0".into(),
        };
        let err = download_configured_from(
            Err(UpdateError::NotConfigured),
            request,
            CancellationToken::new(),
            |_| {},
        )
        .await
        .unwrap_err();
        assert!(matches!(err, UpdateError::NotConfigured));
    }
}
