use serde::Deserialize;
use yohu_protocol::RemoteUpdate;

use crate::error::UpdateError;
use crate::platform::PlatformInfo;
use crate::release::{remote_from_release, ReleaseAsset};

#[derive(Debug, Deserialize)]
struct GhRelease {
    #[serde(default)]
    tag_name: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    assets: Vec<ReleaseAsset>,
}

/// REST `/releases/latest` 响应（含 attachments 列表）。
pub fn remote_from_api_body(body: &str, platform: &PlatformInfo) -> Result<RemoteUpdate, UpdateError> {
    let release: GhRelease =
        serde_json::from_str(body).map_err(|e| UpdateError::Parse(e.to_string()))?;
    if release.draft {
        return Err(UpdateError::DraftRelease);
    }
    remote_from_release(
        &release.tag_name,
        &release.body,
        release.html_url.trim(),
        &release.assets,
        platform,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win64() -> PlatformInfo {
        PlatformInfo {
            version: "0.1.0".into(),
            identifier: "com.yohu.adbtools".into(),
            os: "windows".into(),
            arch: "x86_64".into(),
        }
    }

    #[test]
    fn parse_release_uses_platform_version_and_asset() {
        let body = r#"{
            "tag_name": "v1.2.0",
            "body": "fix windows nsis",
            "html_url": "https://github.com/yohurm/Windows-YoADBTools/releases/tag/v1.2.0",
            "draft": false,
            "assets": [
              {
                "name": "YohuAdbTools_1.2.0_x64-setup.exe",
                "browser_download_url": "https://github.com/yohurm/Windows-YoADBTools/releases/download/v1.2.0/YohuAdbTools_1.2.0_x64-setup.exe",
                "size": 6081740,
                "digest": "sha256:deadbeef"
              }
            ]
        }"#;
        let update = remote_from_api_body(body, &win64()).unwrap();
        assert!(update.has_new_version);
        assert_eq!(update.version, "1.2.0");
        assert_eq!(update.sha256, "deadbeef");
    }
}
