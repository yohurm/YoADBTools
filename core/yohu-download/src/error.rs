//! 下载引擎错误（传输与校验；不含 GitHub / 产品语义）。

use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum DownloadError {
    #[error("下载地址非法")]
    InvalidUrl,
    #[error("文件过大")]
    TooLarge,
    #[error("下载 HTTP {0}")]
    Http(u16),
    #[error("下载失败: {0}")]
    Network(String),
    #[error("校验失败（SHA-256 不匹配）")]
    ChecksumMismatch,
    #[error("大小不匹配")]
    SizeMismatch,
    #[error("下载已取消")]
    Cancelled,
    #[error("写入失败: {0}")]
    Io(String),
}

impl From<reqwest::Error> for DownloadError {
    fn from(e: reqwest::Error) -> DownloadError {
        DownloadError::Network(e.to_string())
    }
}
