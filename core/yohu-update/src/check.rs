//! 检查编排：把平台信息交给 Provider；新版本可只有 Release 页。

use crate::contract::UpdateCheckProvider;
use crate::error::UpdateError;
use crate::platform::PlatformInfo;
use crate::url_policy;
use yohu_protocol::RemoteUpdate;

/// 使用当前平台身份检查更新。
pub async fn check_update<P: UpdateCheckProvider>(
    provider: &P,
    platform: &PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    tracing::info!(
        version = %platform.version,
        identifier = %platform.identifier,
        os = %platform.os,
        arch = %platform.arch,
        "开始检查更新"
    );
    let update = normalize(provider.check(platform).await?)?;
    if !update.has_new_version {
        tracing::info!(version = %update.version, "已是最新版本");
        return Ok(update);
    }
    if update.installer_url.is_none() && update.page_url.is_empty() {
        tracing::warn!(version = %update.version, "检查到新版本但无安装包也无 Release 页");
        return Err(UpdateError::NoInstallerOrPage);
    }
    tracing::info!(
        version = %update.version,
        has_installer = update.installer_url.is_some(),
        "检查到新版本"
    );
    Ok(update)
}

fn normalize(mut update: RemoteUpdate) -> Result<RemoteUpdate, UpdateError> {
    update.page_url = {
        let trimmed = update.page_url.trim();
        if trimmed.is_empty() {
            String::new()
        } else {
            url_policy::assert_http_url(trimmed)?.to_string()
        }
    };
    update.installer_url = match update.installer_url {
        Some(url) => {
            let trimmed = url.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(url_policy::assert_http_url(trimmed)?.to_string())
            }
        }
        None => None,
    };
    Ok(update)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::UpdateError;
    use crate::platform::PlatformInfo;
    use std::sync::Mutex;
    use yohu_protocol::RemoteUpdate;

    struct SpyProvider {
        seen: Mutex<Option<PlatformInfo>>,
        result: Result<RemoteUpdate, UpdateError>,
    }

    impl UpdateCheckProvider for SpyProvider {
        async fn check(&self, platform: &PlatformInfo) -> Result<RemoteUpdate, UpdateError> {
            *self.seen.lock().unwrap() = Some(platform.clone());
            self.result.clone()
        }
    }

    fn platform() -> PlatformInfo {
        PlatformInfo {
            version: "0.1.0".into(),
            identifier: "com.yohu.adbtools".into(),
            os: "windows".into(),
            arch: "x86_64".into(),
        }
    }

    fn remote(has_new: bool, installer: Option<&str>, page: &str) -> RemoteUpdate {
        RemoteUpdate {
            has_new_version: has_new,
            version: "1.2.0".into(),
            description: "fix".into(),
            installer_url: installer.map(str::to_string),
            page_url: page.into(),
            sha256: String::new(),
            size_bytes: 0,
        }
    }

    #[tokio::test]
    async fn check_passes_platform_identity_to_provider() {
        let spy = SpyProvider {
            seen: Mutex::new(None),
            result: Ok(remote(false, None, "")),
        };
        check_update(&spy, &platform()).await.unwrap();
        let seen = spy.seen.lock().unwrap().clone().unwrap();
        assert_eq!(seen.version, "0.1.0");
        assert_eq!(seen.identifier, "com.yohu.adbtools");
        assert_eq!(seen.os, "windows");
        assert_eq!(seen.arch, "x86_64");
    }

    #[tokio::test]
    async fn new_version_without_installer_keeps_page_url() {
        let spy = SpyProvider {
            seen: Mutex::new(None),
            result: Ok(remote(
                true,
                None,
                "https://github.com/o/r/releases/tag/v1.2.0",
            )),
        };
        let update = check_update(&spy, &platform()).await.unwrap();
        assert!(update.installer_url.is_none());
        assert_eq!(
            update.page_url,
            "https://github.com/o/r/releases/tag/v1.2.0"
        );
    }

    #[tokio::test]
    async fn new_version_invalid_installer_url_errors() {
        let spy = SpyProvider {
            seen: Mutex::new(None),
            result: Ok(remote(true, Some("/relative.exe"), "")),
        };
        let err = check_update(&spy, &platform()).await.unwrap_err();
        assert!(matches!(err, UpdateError::InvalidUrl));
    }

    #[tokio::test]
    async fn new_version_without_installer_or_page_errors() {
        let spy = SpyProvider {
            seen: Mutex::new(None),
            result: Ok(remote(true, None, "")),
        };
        let err = check_update(&spy, &platform()).await.unwrap_err();
        assert!(matches!(err, UpdateError::NoInstallerOrPage));
    }

    #[tokio::test]
    async fn new_version_invalid_page_url_errors_even_with_installer() {
        let spy = SpyProvider {
            seen: Mutex::new(None),
            result: Ok(remote(
                true,
                Some("https://cdn.example.com/setup.exe"),
                "not-a-url",
            )),
        };
        let err = check_update(&spy, &platform()).await.unwrap_err();
        assert!(matches!(err, UpdateError::InvalidUrl));
    }

    #[tokio::test]
    async fn new_version_empty_page_with_installer_ok() {
        let spy = SpyProvider {
            seen: Mutex::new(None),
            result: Ok(remote(true, Some("https://cdn.example.com/setup.exe"), "")),
        };
        let update = check_update(&spy, &platform()).await.unwrap();
        assert_eq!(
            update.installer_url.as_deref(),
            Some("https://cdn.example.com/setup.exe")
        );
        assert!(update.page_url.is_empty());
    }

    #[tokio::test]
    async fn new_version_trims_installer_url() {
        let spy = SpyProvider {
            seen: Mutex::new(None),
            result: Ok(remote(
                true,
                Some("  https://cdn.example.com/setup.exe  "),
                " https://github.com/o/r/releases/tag/v1.2.0 ",
            )),
        };
        let update = check_update(&spy, &platform()).await.unwrap();
        assert_eq!(
            update.installer_url.as_deref(),
            Some("https://cdn.example.com/setup.exe")
        );
        assert_eq!(
            update.page_url,
            "https://github.com/o/r/releases/tag/v1.2.0"
        );
    }
}
