//! 更新错误 → IPC。与 `ipc_map` 分开，避免进度事件经过设备目录再绕回本模块。

use yohu_protocol::{IpcError, IpcErrorCode};
use yohu_update::UpdateError;

/// 更新检查 / 下载失败 → IPC。invoke 与 `update/progress` 的 `failed` 共用。
pub fn ipc_update(e: UpdateError) -> IpcError {
    let code = match &e {
        UpdateError::NotConfigured
        | UpdateError::InvalidUrl
        | UpdateError::InvalidInstaller
        | UpdateError::BadHeader
        | UpdateError::TooLarge
        | UpdateError::ChecksumMismatch
        | UpdateError::SizeMismatch => IpcErrorCode::InvalidArgs,
        UpdateError::NoInstallerOrPage
        | UpdateError::NoRelease
        | UpdateError::InstallerNotFound => IpcErrorCode::NotFound,
        UpdateError::Cancelled => IpcErrorCode::Cancelled,
        UpdateError::Platform(_)
        | UpdateError::NotModified
        | UpdateError::Http(_)
        | UpdateError::CheckFailed
        | UpdateError::DownloadFailed
        | UpdateError::DownloadHttp(_)
        | UpdateError::Parse
        | UpdateError::DraftRelease
        | UpdateError::MissingTag
        | UpdateError::Io(_)
        | UpdateError::OpenFailed
        | UpdateError::LaunchFailed
        | UpdateError::HostRoot
        | UpdateError::UnsupportedOs => IpcErrorCode::Internal,
    };
    IpcError {
        code,
        message: e.to_string(),
    }
}
