//! 更新检查 Provider 契约：平台实现可替换，检查编排不感知 HTTP。

use std::future::Future;

use crate::error::UpdateError;
use crate::platform::PlatformInfo;
use yohu_protocol::RemoteUpdate;

/// 向分发平台查询是否有新版本。
pub trait UpdateCheckProvider {
    fn check(
        &self,
        platform: &PlatformInfo,
    ) -> impl Future<Output = Result<RemoteUpdate, UpdateError>> + Send;
}

#[cfg(test)]
mod tests {
    #[test]
    fn cut_update_judgments_stay_with_owner() {
        let release = include_str!("release.rs");
        let artifact = include_str!("artifact.rs");
        let manifest = include_str!("github/manifest.rs");
        let atom = include_str!("github/atom.rs");
        let api = include_str!("github/api.rs");
        let web = include_str!("github/web_latest.rs");
        let provider = include_str!("github/provider.rs");
        let http = include_str!("github/http.rs");

        assert!(
            !artifact.contains("\"macos\" | \"darwin\""),
            "操作系统别名只在 platform::host_os"
        );
        assert!(
            !release.contains("arch == \"x86_64\" || arch == \"amd64\""),
            "CPU 别名只在 platform::cpu_arch"
        );
        assert!(!release.contains("arch == \"aarch64\" || arch == \"arm64\""));
        assert!(!manifest.contains("(\"windows\", \"amd64\")"));
        assert!(!manifest.contains("(\"darwin\", \"aarch64\")"));
        assert_eq!(
            release.matches("version.is_empty()").count(),
            1,
            "去掉前缀后为空只在 release_version"
        );
        assert!(!manifest.contains("strip_tag_prefix"));
        assert!(!manifest.contains("version.is_empty()"));
        assert!(!atom.contains("strip_tag_prefix"));
        assert!(
            !release.contains("releases/download/"),
            "Release 附件直链只在 GitHubUrls::release_asset"
        );
        assert!(!api.contains("if release.draft"));
        assert!(!web.contains("if release.draft"));
        assert!(
            !provider.contains("resp.status != 200"),
            "文档 200 只在 http::document_fetched"
        );
        assert!(
            !provider.contains("token.is_empty()"),
            "空 token 不发 Authorization 只在 url_policy"
        );
        assert!(!http.contains("bearer.filter"));
        assert!(!http.contains("Bearer {"));
    }
}
