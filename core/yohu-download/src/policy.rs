//! 通用 http(s) URL 校验。

use crate::error::DownloadError;

pub fn is_http_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

pub fn assert_http_url(url: &str) -> Result<&str, DownloadError> {
    let trimmed = url.trim();
    if !is_http_url(trimmed) {
        return Err(DownloadError::InvalidUrl);
    }
    let parsed = reqwest::Url::parse(trimmed).map_err(|_| DownloadError::InvalidUrl)?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(DownloadError::InvalidUrl);
    }
    match parsed.host_str() {
        Some(host) if !host.is_empty() => Ok(trimmed),
        _ => Err(DownloadError::InvalidUrl),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_local_paths() {
        assert!(assert_http_url(r"C:\setup.exe").is_err());
        assert!(assert_http_url("https://").is_err());
    }
}
