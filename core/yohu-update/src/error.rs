//! 更新检查错误。

use thiserror::Error;

/// 更新模块错误。安装包前缀句定义在此。下载地址与无状态传输失败引用下载引擎。
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum UpdateError {
    #[error("未配置 GitHub 仓库（config/update.json 或 YOHU_GITHUB_*）")]
    NotConfigured,
    #[error("新版本没有安装包也没有发布页")]
    NoInstallerOrPage,
    #[error("GitHub 上还没有 Release")]
    NoRelease,
    #[error("最新 Release 仍是草稿")]
    DraftRelease,
    #[error("Release 缺少 tag_name")]
    MissingTag,
    #[error("更新平台返回错误: {0}")]
    Platform(String),
    #[error("更新元数据未变化，请稍后再试")]
    NotModified,
    #[error("检查更新 HTTP {0}")]
    Http(u16),
    #[error("检查更新失败")]
    CheckFailed,
    #[error("检查更新请求头非法")]
    BadHeader,
    #[error("{}", yohu_download::DOWNLOAD_FAILED)]
    DownloadFailed,
    /// 安装包下载的 HTTP 状态。不是检查更新。
    #[error("{}", yohu_download::download_http_text(*.0))]
    DownloadHttp(u16),
    #[error("解析更新响应失败")]
    Parse,
    #[error("{}", yohu_download::INVALID_URL)]
    InvalidUrl,
    #[error("安装包文件名非法")]
    InvalidInstaller,
    #[error("安装包过大")]
    TooLarge,
    #[error("安装包校验失败（SHA-256 不匹配）")]
    ChecksumMismatch,
    #[error("安装包大小不匹配")]
    SizeMismatch,
    #[error("安装包不存在或已失效")]
    InstallerNotFound,
    #[error("更新已取消")]
    Cancelled,
    #[error("当前平台不支持该安装包")]
    UnsupportedOs,
    /// 只用于安装包或安装脚本的文件系统写入。载荷是操作系统原文。
    #[error("写入安装包失败: {0}")]
    Io(String),
    #[error("打开下载失败")]
    OpenFailed,
    #[error("启动安装失败")]
    LaunchFailed,
    #[error("找不到本机产品目录")]
    HostRoot,
}

impl From<reqwest::Error> for UpdateError {
    fn from(e: reqwest::Error) -> Self {
        match e.status() {
            Some(status) => UpdateError::Http(status.as_u16()),
            None => UpdateError::CheckFailed,
        }
    }
}

impl From<yohu_download::DownloadError> for UpdateError {
    fn from(e: yohu_download::DownloadError) -> Self {
        use yohu_download::DownloadError as D;
        match e {
            D::InvalidUrl => UpdateError::InvalidUrl,
            D::TooLarge => UpdateError::TooLarge,
            D::Http(c) => UpdateError::DownloadHttp(c),
            D::Network => UpdateError::DownloadFailed,
            D::ChecksumMismatch => UpdateError::ChecksumMismatch,
            D::SizeMismatch => UpdateError::SizeMismatch,
            D::Cancelled => UpdateError::Cancelled,
            D::Io(m) => UpdateError::Io(m),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_network_is_not_a_check_failure() {
        let err = UpdateError::from(yohu_download::DownloadError::Network);
        assert_eq!(err, UpdateError::DownloadFailed);
        assert_eq!(err.to_string(), yohu_download::DOWNLOAD_FAILED);
        assert!(!err.to_string().contains("http"));
        let url = UpdateError::from(yohu_download::DownloadError::InvalidUrl);
        assert_eq!(url, UpdateError::InvalidUrl);
        assert_eq!(url.to_string(), yohu_download::INVALID_URL);
        let http = UpdateError::from(yohu_download::DownloadError::Http(404));
        assert_eq!(http, UpdateError::DownloadHttp(404));
        assert_eq!(http.to_string(), yohu_download::download_http_text(404));
        assert!(!http.to_string().contains("检查更新"));
    }

    #[test]
    fn check_failed_has_one_sentence() {
        assert_eq!(UpdateError::CheckFailed.to_string(), "检查更新失败");
    }

    #[test]
    fn not_modified_is_its_own_sentence() {
        assert_eq!(
            UpdateError::NotModified.to_string(),
            "更新元数据未变化，请稍后再试"
        );
    }

    #[test]
    fn open_launch_and_host_root_are_not_writes() {
        assert_eq!(UpdateError::OpenFailed.to_string(), "打开下载失败");
        assert_eq!(UpdateError::LaunchFailed.to_string(), "启动安装失败");
        assert_eq!(UpdateError::HostRoot.to_string(), "找不到本机产品目录");
        for err in [
            UpdateError::OpenFailed,
            UpdateError::LaunchFailed,
            UpdateError::HostRoot,
        ] {
            assert!(!err.to_string().contains("写入"));
        }
    }
}
