//! 安装包缓存路径：家园 `cache/update/`，缺 OS 数据根则失败上抛。

use std::path::{Path, PathBuf};

use yohu_protocol::{dir, DATA_DIR_NAME};
use yohu_runtime::app_data_root;

use crate::artifact::InstallerKind;
use crate::error::UpdateError;

/// 产品家园 `cache/update/`：不进 NSIS INSTDIR，覆盖安装时不会自删。
pub fn update_cache_dir() -> Result<PathBuf, UpdateError> {
    Ok(app_data_root(DATA_DIR_NAME)
        .map_err(|e| UpdateError::Io(e.to_string()))?
        .join(dir::CACHE)
        .join(dir::UPDATE))
}

/// 从下载 URL 取出合法的安装包文件名。
pub fn installer_file_name(url: &str) -> Result<String, UpdateError> {
    let trimmed = url.trim();
    let without_query = trimmed.split(['?', '#']).next().unwrap_or(trimmed);
    let raw = without_query.rsplit('/').next().unwrap_or("").trim();
    if raw.is_empty() {
        return Err(UpdateError::InvalidInstaller);
    }
    let decoded = raw.replace("%20", " ");
    if InstallerKind::from_name(&decoded).is_none() {
        return Err(UpdateError::InvalidInstaller);
    }
    if decoded
        .chars()
        .any(|c| !(c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | ' ')))
    {
        return Err(UpdateError::InvalidInstaller);
    }
    if decoded.contains("..") {
        return Err(UpdateError::InvalidInstaller);
    }
    Ok(decoded)
}

/// 把检查结果里的 URL 编成缓存路径。
pub fn installer_dest(url: &str) -> Result<PathBuf, UpdateError> {
    Ok(update_cache_dir()?.join(installer_file_name(url)?))
}

/// 安装包必须落在更新缓存目录内，且为已识别形态。
pub fn assert_cached_installer(path: &Path) -> Result<PathBuf, UpdateError> {
    if !path.is_absolute() {
        return Err(UpdateError::InvalidInstaller);
    }
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or(UpdateError::InvalidInstaller)?;
    if InstallerKind::from_name(name).is_none() {
        return Err(UpdateError::InvalidInstaller);
    }
    if !path.is_file() {
        return Err(UpdateError::InstallerNotFound);
    }
    let cache = update_cache_dir()?
        .canonicalize()
        .map_err(|_| UpdateError::InstallerNotFound)?;
    let file = path
        .canonicalize()
        .map_err(|_| UpdateError::InstallerNotFound)?;
    if !file.starts_with(&cache) {
        return Err(UpdateError::InvalidInstaller);
    }
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installer_file_name_from_github_asset() {
        let name = installer_file_name(
            "https://github.com/yohurm/Windows-YoADBTools/releases/download/v0.1.2/YohuAdbTools_0.1.2_x64-setup.exe",
        )
        .unwrap();
        assert_eq!(name, "YohuAdbTools_0.1.2_x64-setup.exe");
        let dmg = installer_file_name(
            "https://github.com/yohurm/Windows-YoADBTools/releases/download/v0.1.2/YohuAdbTools_0.1.2_aarch64.dmg",
        )
        .unwrap();
        assert_eq!(dmg, "YohuAdbTools_0.1.2_aarch64.dmg");
    }

    #[test]
    fn installer_file_name_rejects_html_release_page() {
        assert!(matches!(
            installer_file_name("https://github.com/yohurm/Windows-YoADBTools/releases/tag/v0.1.2"),
            Err(UpdateError::InvalidInstaller)
        ));
        assert!(matches!(
            installer_file_name("https://example.com/YohuAdbTools_0.1.2_x64.msi"),
            Err(UpdateError::InvalidInstaller)
        ));
    }

    #[test]
    fn update_cache_dir_propagates_os_root() {
        let dir = update_cache_dir().expect("os app data root");
        assert!(dir.ends_with(std::path::Path::new(dir::CACHE).join(dir::UPDATE)));
    }
}
