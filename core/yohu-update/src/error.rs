//! 更新检查错误。

use thiserror::Error;

/// 更新模块错误。用户可见文案只定义在此。
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
    #[error("检查更新 HTTP {0}")]
    Http(u16),
    #[error("检查更新失败: {0}")]
    Network(String),
    #[error("解析更新响应失败: {0}")]
    Parse(String),
    #[error("下载地址非法")]
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
    #[error("写入安装包失败: {0}")]
    Io(String),
}

impl From<reqwest::Error> for UpdateError {
    fn from(e: reqwest::Error) -> Self {
        UpdateError::Network(e.to_string())
    }
}

impl From<yohu_download::DownloadError> for UpdateError {
    fn from(e: yohu_download::DownloadError) -> Self {
        use yohu_download::DownloadError as D;
        match e {
            D::InvalidUrl => UpdateError::InvalidUrl,
            D::TooLarge => UpdateError::TooLarge,
            D::Http(c) => UpdateError::Http(c),
            D::Network(m) => UpdateError::Network(m),
            D::ChecksumMismatch => UpdateError::ChecksumMismatch,
            D::SizeMismatch => UpdateError::SizeMismatch,
            D::Cancelled => UpdateError::Cancelled,
            D::Io(m) => UpdateError::Io(m),
        }
    }
}
