use std::collections::HashMap;

use serde::Deserialize;
use yohu_protocol::RemoteUpdate;

use crate::error::UpdateError;
use crate::platform::PlatformInfo;
use crate::release::{is_newer, strip_tag_prefix};
use yohu_textparsing::{to_plain, TextFormat};

pub const MANIFEST_PRIMARY: &str = "update-manifest.json";
pub const MANIFEST_TAURI_ALIAS: &str = "latest.json";

pub const MANIFEST_FILES: &[&str] = &[MANIFEST_PRIMARY, MANIFEST_TAURI_ALIAS];

#[derive(Debug, Deserialize)]
struct UpdateManifest {
    version: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    page_url: String,
    #[serde(default)]
    platforms: HashMap<String, ManifestPlatform>,
}

#[derive(Debug, Deserialize)]
struct ManifestPlatform {
    url: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    size_bytes: u64,
    #[serde(default)]
    sha256: String,
}

/// 解析静态 manifest（Tauri `latest.json` 平台块 + 本产品扩展字段）。
pub fn remote_from_manifest_json(
    body: &str,
    platform: &PlatformInfo,
    fallback_page_url: &str,
) -> Result<RemoteUpdate, UpdateError> {
    let manifest: UpdateManifest =
        serde_json::from_str(body).map_err(|e| UpdateError::Parse(e.to_string()))?;
    let version = strip_tag_prefix(&manifest.version).to_string();
    if version.is_empty() {
        return Err(UpdateError::MissingTag);
    }
    let key = platform_manifest_key(platform).ok_or(UpdateError::UnsupportedOs)?;
    let plat = manifest
        .platforms
        .get(key)
        .ok_or(UpdateError::NoInstallerOrPage)?;
    let url = plat.url.trim();
    if url.is_empty() {
        return Err(UpdateError::NoInstallerOrPage);
    }
    let page_url = {
        let trimmed = manifest.page_url.trim();
        if trimmed.is_empty() {
            fallback_page_url.to_string()
        } else {
            trimmed.to_string()
        }
    };
    let installer_name = plat.name.trim().to_string();
    Ok(RemoteUpdate {
        has_new_version: is_newer(&version, &platform.version),
        version,
        description: to_plain(&manifest.notes, TextFormat::Markdown),
        installer_url: Some(url.to_string()),
        installer_name,
        page_url,
        sha256: plat.sha256.trim().to_string(),
        size_bytes: plat.size_bytes,
    })
}

pub fn platform_manifest_key(platform: &PlatformInfo) -> Option<&'static str> {
    let os = platform.os.trim().to_ascii_lowercase();
    let arch = platform.arch.trim().to_ascii_lowercase();
    match (os.as_str(), arch.as_str()) {
        ("windows", "x86_64") | ("windows", "amd64") => Some("windows-x86_64"),
        ("macos", "aarch64") | ("darwin", "aarch64") | ("macos", "arm64") | ("darwin", "arm64") => {
            Some("darwin-aarch64")
        }
        ("macos", "x86_64") | ("darwin", "x86_64") | ("macos", "amd64") | ("darwin", "amd64") => {
            Some("darwin-x86_64")
        }
        _ => None,
    }
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
    fn parses_manifest_platform_block() {
        let body = r#"{
            "version": "v1.2.0",
            "notes": "hello",
            "page_url": "https://github.com/o/r/releases/tag/v1.2.0",
            "platforms": {
                "windows-x86_64": {
                    "url": "https://github.com/o/r/releases/download/v1.2.0/setup.exe",
                    "name": "setup.exe",
                    "size_bytes": 100,
                    "sha256": "abc"
                }
            }
        }"#;
        let u = remote_from_manifest_json(body, &win64(), "https://fallback").unwrap();
        assert!(u.has_new_version);
        assert_eq!(u.version, "1.2.0");
        assert_eq!(u.sha256, "abc");
    }
}
