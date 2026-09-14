//! OS 应用数据根、安装根与打开路径。产品子目录仍由壳用 protocol `dir::*` 拼装。

use std::path::{Path, PathBuf};

/// 当前 OS 上的可执行文件名：Windows 加 `.exe`，其它平台原样。
pub fn host_bin_name(stem: &str) -> String {
    #[cfg(windows)]
    {
        format!("{stem}.exe")
    }
    #[cfg(not(windows))]
    {
        stem.to_string()
    }
}

/// 确保路径对当前用户可执行（Unix `+x`；Windows 无操作）。
pub fn ensure_executable(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(path)?.permissions();
        let mode = perms.mode();
        if mode & 0o111 == 0 {
            perms.set_mode(mode | 0o111);
            std::fs::set_permissions(path, perms)?;
        }
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

/// 本机应用数据根：`<os_app_data>/<product_dir_name>`。
///
/// Windows：`%LOCALAPPDATA%\<name>`。macOS：`~/Library/Application Support/<name>`。
/// 其它 Unix：`$XDG_DATA_HOME/<name>` 或 `~/.local/share/<name>`。
/// 缺环境变量或值为空时返回 `Err`，不回落到当前工作目录。
pub fn app_data_root(product_dir_name: &str) -> std::io::Result<PathBuf> {
    #[cfg(windows)]
    {
        Ok(env_dir("LOCALAPPDATA")?.join(product_dir_name))
    }
    #[cfg(target_os = "macos")]
    {
        Ok(env_dir("HOME")?
            .join("Library")
            .join("Application Support")
            .join(product_dir_name))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(xdg) = optional_env_dir("XDG_DATA_HOME")? {
            return Ok(xdg.join(product_dir_name));
        }
        Ok(env_dir("HOME")?
            .join(".local")
            .join("share")
            .join(product_dir_name))
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = product_dir_name;
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "app_data_root: unsupported OS",
        ))
    }
}

/// 本机 per-user 安装根（载荷，与数据根分离）。
///
/// Windows：`%LOCALAPPDATA%\Programs\<name>`（VS Code User / Known Folder 约定）。
/// macOS：`/Applications/<name>.app`。其它 Unix：与 [`app_data_root`] 相同（产品不交付）。
/// Windows 缺 `LOCALAPPDATA` 时返回 `Err`，不回落到当前工作目录。
pub fn app_install_root(product_dir_name: &str) -> std::io::Result<PathBuf> {
    #[cfg(windows)]
    {
        Ok(env_dir("LOCALAPPDATA")?
            .join("Programs")
            .join(product_dir_name))
    }
    #[cfg(target_os = "macos")]
    {
        Ok(PathBuf::from("/Applications").join(format!("{product_dir_name}.app")))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        app_data_root(product_dir_name)
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = product_dir_name;
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "app_install_root: unsupported OS",
        ))
    }
}

fn env_dir(name: &str) -> std::io::Result<PathBuf> {
    require_env_dir(name, std::env::var(name))
}

fn require_env_dir(
    name: &str,
    value: Result<String, std::env::VarError>,
) -> std::io::Result<PathBuf> {
    match value {
        Ok(raw) if !raw.is_empty() => Ok(PathBuf::from(raw)),
        Ok(_) => Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("{name} is empty"),
        )),
        Err(err) => Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("{name}: {err}"),
        )),
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn optional_env_dir(name: &str) -> std::io::Result<Option<PathBuf>> {
    match std::env::var(name) {
        Ok(raw) if !raw.is_empty() => Ok(Some(PathBuf::from(raw))),
        Ok(_) | Err(std::env::VarError::NotPresent) => Ok(None),
        Err(err) => Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("{name}: {err}"),
        )),
    }
}

/// 用系统文件管理器打开路径：目录进入该处；文件则尽量选中。
pub fn open_path(path: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("explorer");
        if path.is_file() {
            cmd.arg(format!("/select,{}", path.display()));
        } else {
            cmd.arg(path);
        }
        cmd.spawn()?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(path).spawn()?;
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(path).spawn()?;
        Ok(())
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = path;
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "open_path: unsupported OS",
        ))
    }
}

/// 用系统默认方式打开 http(s) URL（浏览器兜底）。
pub fn open_url(url: &str) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(url).spawn()?;
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(url).spawn()?;
        Ok(())
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = url;
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "open_url: unsupported OS",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_data_root_joins_product_name() {
        let p = app_data_root("YohuAdbTools").expect("os app data root");
        assert!(p.ends_with("YohuAdbTools"));
    }

    #[test]
    fn app_install_root_is_not_data_root_on_windows() {
        let data = app_data_root("YohuAdbTools").expect("os app data root");
        let install = app_install_root("YohuAdbTools").expect("os install root");
        assert!(install.ends_with("YohuAdbTools"));
        #[cfg(windows)]
        {
            assert!(install
                .parent()
                .map(|d| d.ends_with("Programs"))
                .unwrap_or(false));
            assert_ne!(data, install);
        }
        #[cfg(target_os = "macos")]
        {
            assert!(install.to_string_lossy().contains("YohuAdbTools.app"));
            assert_ne!(data, install);
        }
    }

    #[cfg(windows)]
    #[test]
    fn app_data_root_uses_localappdata() {
        let local = std::env::var("LOCALAPPDATA").expect("LOCALAPPDATA");
        let p = app_data_root("YohuAdbTools").expect("os app data root");
        assert_eq!(p, PathBuf::from(local).join("YohuAdbTools"));
    }

    #[cfg(windows)]
    #[test]
    fn app_install_root_uses_localappdata_programs() {
        let local = std::env::var("LOCALAPPDATA").expect("LOCALAPPDATA");
        let p = app_install_root("YohuAdbTools").expect("os install root");
        assert_eq!(
            p,
            PathBuf::from(local).join("Programs").join("YohuAdbTools")
        );
    }

    #[test]
    fn require_env_dir_fails_when_missing() {
        let err = require_env_dir("LOCALAPPDATA", Err(std::env::VarError::NotPresent)).unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::NotFound);
        assert!(err.to_string().contains("LOCALAPPDATA"));
    }

    #[test]
    fn require_env_dir_fails_when_empty() {
        let err = require_env_dir("HOME", Ok(String::new())).unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::NotFound);
        assert!(err.to_string().contains("HOME"));
    }

    #[test]
    fn require_env_dir_keeps_nonempty_value() {
        let p = require_env_dir("LOCALAPPDATA", Ok(r"C:\Users\me\AppData\Local".into()))
            .expect("non-empty env");
        assert_eq!(p, PathBuf::from(r"C:\Users\me\AppData\Local"));
    }

    #[test]
    fn host_bin_name_matches_os() {
        let name = host_bin_name("adb");
        #[cfg(windows)]
        assert_eq!(name, "adb.exe");
        #[cfg(not(windows))]
        assert_eq!(name, "adb");
    }
}
