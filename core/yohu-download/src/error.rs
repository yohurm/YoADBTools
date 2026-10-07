//! 下载引擎错误（传输与校验；不含 GitHub / 产品语义）。

use thiserror::Error;

/// 下载地址不是 http/https。更新层同一事实引用这一句。
pub const INVALID_URL: &str = "下载地址非法";
/// 没有 HTTP 状态的传输失败。更新层同一事实引用这一句。
pub const DOWNLOAD_FAILED: &str = "下载失败";

/// 下载响应的 HTTP 状态。检查更新不引用这一句。
pub fn download_http_text(status: u16) -> String {
    format!("下载 HTTP {status}")
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum DownloadError {
    #[error("{}", INVALID_URL)]
    InvalidUrl,
    #[error("文件过大")]
    TooLarge,
    #[error("{}", download_http_text(*.0))]
    Http(u16),
    #[error("{}", DOWNLOAD_FAILED)]
    Network,
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
        match e.status() {
            Some(status) => DownloadError::Http(status.as_u16()),
            None => DownloadError::Network,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_sentence_has_no_payload() {
        assert_eq!(DownloadError::Network.to_string(), DOWNLOAD_FAILED);
        assert_eq!(DownloadError::InvalidUrl.to_string(), INVALID_URL);
        assert_eq!(
            DownloadError::Http(404).to_string(),
            download_http_text(404)
        );
    }
}
