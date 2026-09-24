//! 仓库 Release 公共解析：版本比较、安装包匹配、组装 RemoteUpdate。

use yohu_protocol::RemoteUpdate;

use crate::artifact::InstallerKind;
use crate::error::UpdateError;
use crate::platform::PlatformInfo;
use crate::url_policy;
use yohu_textparsing::{to_plain, TextFormat};

const SCORE_BASE: i32 = 12;
const SCORE_NSIS_SETUP: i32 = 6;
const SCORE_NSIS_NAME: i32 = 3;
const SCORE_NSIS_WIN: i32 = 2;
const SCORE_DMG_HOST: i32 = 3;
const SCORE_ARCH: i32 = 8;

/// 仓库 Release 里的一个附件（平台字段对齐）。
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ReleaseAsset {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub browser_download_url: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub digest: String,
}

/// 比较 tag / 版本号：去掉 `v` 前缀后按数字段比较。
pub fn is_newer(remote: &str, current: &str) -> bool {
    let remote = version_parts(remote);
    let current = version_parts(current);
    let len = remote.len().max(current.len());
    for i in 0..len {
        let a = remote.get(i).copied().unwrap_or(0);
        let b = current.get(i).copied().unwrap_or(0);
        if a != b {
            return a > b;
        }
    }
    false
}

/// 去掉 tag 的 `v`/`V` 前缀。
pub fn strip_tag_prefix(tag: &str) -> &str {
    tag.trim().trim_start_matches(['v', 'V']).trim()
}

fn version_parts(value: &str) -> Vec<u64> {
    strip_tag_prefix(value)
        .split(|c: char| !c.is_ascii_digit())
        .filter(|p| !p.is_empty())
        .filter_map(|p| p.parse().ok())
        .collect()
}

/// 按当前 OS / 架构挑安装包。形态只认 [`InstallerKind`]。
pub fn pick_asset<'a>(
    assets: &'a [ReleaseAsset],
    platform: &PlatformInfo,
) -> Option<&'a ReleaseAsset> {
    assets
        .iter()
        .filter(|a| url_policy::is_http_url(a.browser_download_url.trim()))
        .filter_map(|a| {
            let score = asset_score(&a.name, platform)?;
            Some((score, a))
        })
        .max_by_key(|(score, a)| (*score, a.size))
        .map(|(_, a)| a)
}

/// 按当前 OS / 架构给安装包打分；形态或架构不匹配返回 None。
fn asset_score(name: &str, platform: &PlatformInfo) -> Option<i32> {
    let kind = InstallerKind::from_name(name)?;
    let want = InstallerKind::for_os(&platform.os)?;
    if kind != want {
        return None;
    }
    let n = name.to_ascii_lowercase();
    let arch = platform.arch.to_ascii_lowercase();
    let is_x64 = arch == "x86_64" || arch == "amd64";
    let is_arm64 = arch == "aarch64" || arch == "arm64";

    if is_x64
        && contains_any(&n, &["arm64", "aarch64", "armv7"])
        && !contains_any(&n, &["x64", "x86_64", "amd64"])
    {
        return None;
    }
    if is_arm64
        && contains_any(&n, &["x64", "x86_64", "amd64", "win32", "i686"])
        && !contains_any(&n, &["arm64", "aarch64"])
    {
        return None;
    }

    let mut score = SCORE_BASE;
    match kind {
        InstallerKind::Nsis => {
            if n.contains("setup") {
                score += SCORE_NSIS_SETUP;
            }
            if n.contains("nsis") {
                score += SCORE_NSIS_NAME;
            }
            if n.contains("win") {
                score += SCORE_NSIS_WIN;
            }
        }
        InstallerKind::Dmg => {
            if contains_any(&n, &["darwin", "macos", "osx"]) {
                score += SCORE_DMG_HOST;
            }
        }
    }
    if is_x64 && contains_any(&n, &["x64", "x86_64", "amd64", "win64"]) {
        score += SCORE_ARCH;
    }
    if is_arm64 && contains_any(&n, &["arm64", "aarch64"]) {
        score += SCORE_ARCH;
    }

    Some(score)
}

fn contains_any(hay: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| hay.contains(n))
}

fn sha256_from_digest(digest: &str) -> String {
    let d = digest.trim();
    let lower = d.to_ascii_lowercase();
    if let Some(rest) = lower.strip_prefix("sha256:") {
        rest.to_string()
    } else {
        String::new()
    }
}

/// CI 约定安装包文件名（无 manifest / 无 REST assets 时的直链）。
pub fn conventional_installer_name(platform: &PlatformInfo, version: &str) -> Option<String> {
    let kind = InstallerKind::for_os(&platform.os)?;
    let arch = platform.arch.trim().to_ascii_lowercase();
    match kind {
        InstallerKind::Nsis if arch == "x86_64" || arch == "amd64" => Some(format!(
            "YohuAdbTools_{version}_x64-setup.exe"
        )),
        InstallerKind::Dmg if arch == "aarch64" || arch == "arm64" => {
            Some(format!("YohuAdbTools_{version}_aarch64.dmg"))
        }
        InstallerKind::Dmg if arch == "x86_64" || arch == "amd64" => {
            Some(format!("YohuAdbTools_{version}_x64.dmg"))
        }
        _ => None,
    }
}

pub fn github_release_download_url(owner: &str, repo: &str, tag: &str, file_name: &str) -> String {
    format!("https://github.com/{owner}/{repo}/releases/download/{tag}/{file_name}")
}

/// Atom / Web Latest 得到 tag 后，用约定文件名组装 `RemoteUpdate`（无 size/sha256）。
pub fn remote_from_tag_and_notes(
    tag: &str,
    notes: &str,
    page_url: &str,
    owner: &str,
    repo: &str,
    platform: &PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    let version = strip_tag_prefix(tag).to_string();
    if version.is_empty() {
        return Err(UpdateError::MissingTag);
    }
    let installer_name = conventional_installer_name(platform, &version)
        .ok_or(UpdateError::NoInstallerOrPage)?;
    let installer_url = github_release_download_url(owner, repo, tag, &installer_name);
    Ok(RemoteUpdate {
        has_new_version: is_newer(&version, &platform.version),
        version,
        description: to_plain(notes, TextFormat::Markdown),
        installer_url: Some(installer_url),
        installer_name,
        page_url: page_url.trim().to_string(),
        sha256: String::new(),
        size_bytes: 0,
    })
}

/// 把一份 Release 元数据编成 `RemoteUpdate`。
pub fn remote_from_release(
    tag_name: &str,
    body: &str,
    page_url: &str,
    assets: &[ReleaseAsset],
    platform: &PlatformInfo,
) -> Result<RemoteUpdate, UpdateError> {
    let version = strip_tag_prefix(tag_name).to_string();
    if version.is_empty() {
        return Err(UpdateError::MissingTag);
    }
    let page_url = page_url.trim().to_string();
    let (installer_url, installer_name, size_bytes, sha256) =
        if let Some(asset) = pick_asset(assets, platform) {
            (
                Some(asset.browser_download_url.trim().to_string()),
                asset.name.trim().to_string(),
                asset.size,
                sha256_from_digest(&asset.digest),
            )
        } else {
            (None, String::new(), 0, String::new())
        };
    Ok(RemoteUpdate {
        has_new_version: is_newer(&version, &platform.version),
        version,
        description: to_plain(body, TextFormat::Markdown),
        installer_url,
        installer_name,
        page_url,
        sha256,
        size_bytes,
    })
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

    fn asset(name: &str, url: &str, size: u64) -> ReleaseAsset {
        ReleaseAsset {
            name: name.into(),
            browser_download_url: url.into(),
            size,
            digest: String::new(),
        }
    }

    #[test]
    fn is_newer_strips_v_and_compares_semver() {
        assert!(is_newer("v1.2.0", "0.1.0"));
        assert!(is_newer("0.2.0", "0.1.9"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("v0.1.0", "0.1.0"));
        assert!(!is_newer("0.0.9", "0.1.0"));
    }

    #[test]
    fn pick_asset_prefers_windows_x64_setup() {
        let assets = vec![
            asset(
                "YohuAdbTools_1.2.0_aarch64.dmg",
                "https://example.com/mac.dmg",
                10,
            ),
            asset(
                "YohuAdbTools_1.2.0_x64-setup.exe",
                "https://example.com/YohuAdbTools_1.2.0_x64-setup.exe",
                20,
            ),
            asset(
                "YohuAdbTools_1.2.0_arm64-setup.exe",
                "https://example.com/arm.exe",
                30,
            ),
        ];
        let picked = pick_asset(&assets, &win64()).unwrap();
        assert!(picked.name.contains("x64-setup.exe"));
    }

    #[test]
    fn pick_asset_ignores_msi_and_app() {
        let assets = vec![
            asset(
                "YohuAdbTools_1.2.0_x64.msi",
                "https://example.com/setup.msi",
                99,
            ),
            asset(
                "YohuAdbTools.app.zip",
                "https://example.com/YohuAdbTools.app.zip",
                80,
            ),
        ];
        assert!(pick_asset(&assets, &win64()).is_none());
    }

    fn mac_arm() -> PlatformInfo {
        PlatformInfo {
            version: "0.1.0".into(),
            identifier: "com.yohu.adbtools".into(),
            os: "macos".into(),
            arch: "aarch64".into(),
        }
    }

    #[test]
    fn pick_asset_prefers_macos_arm_dmg() {
        let assets = vec![
            asset(
                "YohuAdbTools_1.2.0_x64-setup.exe",
                "https://example.com/win.exe",
                20,
            ),
            asset(
                "YohuAdbTools_1.2.0_aarch64.dmg",
                "https://example.com/mac.dmg",
                10,
            ),
            asset(
                "YohuAdbTools_1.2.0_x64.dmg",
                "https://example.com/mac-intel.dmg",
                12,
            ),
        ];
        let picked = pick_asset(&assets, &mac_arm()).unwrap();
        assert!(picked.name.contains("aarch64.dmg"));
    }

    #[test]
    fn remote_from_release_same_version_keeps_page_not_installer() {
        let update = remote_from_release(
            "0.1.0",
            "",
            "https://github.com/yohurm/Windows-YoADBTools",
            &[],
            &win64(),
        )
        .unwrap();
        assert!(!update.has_new_version);
        assert!(update.installer_url.is_none());
        assert_eq!(
            update.page_url,
            "https://github.com/yohurm/Windows-YoADBTools"
        );
    }
}
