//! URL 策略：http(s) 校验、GitHub 主机判定（Authorization 范围）。

use crate::error::UpdateError;

pub fn is_http_url(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

/// 仅允许打开或下载 http(s) 地址，且必须带主机。
pub fn assert_http_url(url: &str) -> Result<&str, UpdateError> {
    yohu_download::assert_http_url(url).map_err(|_| UpdateError::InvalidUrl)
}

/// GitHub 下载用的 Authorization 头（仅主机命中时）。
pub fn authorization_header(url: &str, token: &str) -> Option<(String, String)> {
    github_bearer_token(url, token).map(|t| ("Authorization".into(), format!("Bearer {t}")))
}

/// GitHub 下载 / API / 附件主机（含 release-assets 同类 CDN）。
pub fn is_github_host(url: &str) -> bool {
    host_of(url).is_some_and(|host| {
        host == "github.com"
            || host.ends_with(".github.com")
            || host == "githubusercontent.com"
            || host.ends_with(".githubusercontent.com")
    })
}

/// 仅 GitHub 主机且 token 非空时返回 Bearer 凭据。
pub fn github_bearer_token<'a>(url: &str, token: &'a str) -> Option<&'a str> {
    let token = token.trim();
    if token.is_empty() || !is_github_host(url) {
        None
    } else {
        Some(token)
    }
}

fn host_of(url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(url.trim()).ok()?;
    let host = parsed
        .host_str()?
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if host.is_empty() {
        None
    } else {
        Some(host)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_and_https_ok() {
        assert!(is_http_url("https://example.com/a.exe"));
        assert!(is_http_url("http://example.com/a.exe"));
        assert!(is_http_url("  https://cdn.example.com/setup.exe  "));
        assert!(!is_http_url("ftp://x"));
        assert!(!is_http_url(""));
        assert!(!is_http_url(r"C:\setup.exe"));
    }

    #[test]
    fn assert_http_url_rejects_local_paths_and_hostless() {
        assert!(assert_http_url(r"C:\setup.exe").is_err());
        assert!(assert_http_url("https://").is_err());
        assert_eq!(
            assert_http_url(" https://example.com/a.exe ").unwrap(),
            "https://example.com/a.exe"
        );
    }

    #[test]
    fn github_hosts_accept_release_and_cdn() {
        assert!(is_github_host(
            "https://github.com/yohurm/Windows-YoADBTools/releases/download/v1/a.exe"
        ));
        assert!(is_github_host(
            "https://api.github.com/repos/o/r/releases/assets/1"
        ));
        assert!(is_github_host(
            "https://objects.githubusercontent.com/release-assets/1"
        ));
        assert!(is_github_host(
            "https://release-assets.githubusercontent.com/github-production-release-asset/1"
        ));
        assert!(is_github_host("https://GITHUB.COM/o/r/a.exe"));
    }

    #[test]
    fn github_hosts_reject_lookalikes_and_other_http() {
        assert!(!is_github_host("https://cdn.example.com/a.exe"));
        assert!(!is_github_host("https://github.com.evil.com/a.exe"));
        assert!(!is_github_host(
            "https://objects.githubusercontent.com.evil.com/a.exe"
        ));
        assert!(!is_github_host("http://127.0.0.1:9/a.exe"));
        assert!(!is_github_host("https://example.com/?u=github.com"));
    }

    #[test]
    fn authorization_header_matches_bearer_policy() {
        let url = "https://github.com/yohurm/Windows-YoADBTools/releases/download/v1/a.exe";
        let h = super::authorization_header(url, "secret").expect("header");
        assert_eq!(h.0, "Authorization");
        assert_eq!(h.1, "Bearer secret");
        assert!(super::authorization_header("https://cdn.example.com/a.exe", "secret").is_none());
    }

    #[test]
    fn bearer_token_only_on_github_hosts() {
        assert_eq!(
            github_bearer_token(
                "https://github.com/o/r/releases/download/v1/a.exe",
                " secret "
            ),
            Some("secret")
        );
        assert_eq!(
            github_bearer_token("https://cdn.example.com/a.exe", "secret"),
            None
        );
        assert_eq!(
            github_bearer_token("https://github.com/o/r/a.exe", "   "),
            None
        );
    }
}
