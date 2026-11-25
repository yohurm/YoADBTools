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

/// 定位 workspace `target` 下某个 member 的明文二进制（集成测试 fixture 用）。
///
/// 兼容 Cargo 的常见产物布局：
/// - `target/<profile>/<bin>`
/// - `target/<triple>/<profile>/<bin>`（指定 `--target` 时）
/// - `target/<profile>/build/<pkg>/<hash>/out/<bin>`（构建目录布局）
///
/// 找不到时返回 `None`，调用方自行决定报错。
pub fn workspace_bin_path(stem: &str) -> Option<PathBuf> {
    let name = host_bin_name(stem);
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR")); // core/yohu-runtime
    let root = manifest.parent()?.parent()?;
    let target = match std::env::var_os("CARGO_TARGET_DIR") {
        Some(dir) => {
            let p = PathBuf::from(dir);
            if p.is_absolute() {
                p
            } else {
                root.join(p)
            }
        }
        None => root.join("target"),
    };

    for profile in ["debug", "release"] {
        let base = target.join(profile);
        let direct = base.join(&name);
        if direct.is_file() {
            return Some(direct);
        }
        // 多目标三元组目录：target/<triple>/<profile>/<bin>
        if let Ok(entries) = std::fs::read_dir(&target) {
            for entry in entries.flatten() {
                let candidate = entry.path().join(profile).join(&name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
        // 兜底：在 profile 目录内按名字有限深度搜索（跳过增量缓存）。
        if let Some(found) = find_named_file(&base, std::ffi::OsStr::new(&name), 8) {
            return Some(found);
        }
    }
    None
}

fn find_named_file(dir: &Path, name: &std::ffi::OsStr, depth: usize) -> Option<PathBuf> {
    if depth == 0 {
        return None;
    }
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_file() {
            if path.file_name() == Some(name) {
                return Some(path);
            }
        } else if file_type.is_dir() {
            let dir_name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
            if matches!(dir_name, "incremental" | ".fingerprint") {
                continue;
            }
            if let Some(found) = find_named_file(&path, name, depth - 1) {
                return Some(found);
            }
        }
    }
    None
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
/// macOS：`/Applications/<name>.app`。
/// 其它 Unix：`$HOME/.local/opt/<name>`（对照 Programs；不跟 `XDG_DATA_HOME` 走）。
/// 缺环境变量或值为空时返回 `Err`，不回落到当前工作目录。
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
        Ok(env_dir("HOME")?
            .join(".local")
            .join("opt")
            .join(product_dir_name))
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
    fn app_install_root_is_not_data_root() {
        let data = app_data_root("YohuAdbTools").expect("os app data root");
        let install = app_install_root("YohuAdbTools").expect("os install root");
        #[cfg(windows)]
        {
            assert!(install.ends_with("YohuAdbTools"));
            assert!(install
                .parent()
                .map(|d| d.ends_with("Programs"))
                .unwrap_or(false));
            assert_ne!(data, install);
        }
        #[cfg(target_os = "macos")]
        {
            assert!(install.ends_with("YohuAdbTools.app"));
            assert_ne!(data, install);
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            assert!(install.ends_with("YohuAdbTools"));
            assert!(install
                .parent()
                .map(|d| d.ends_with("opt"))
                .unwrap_or(false));
            assert_ne!(data, install);
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn app_install_root_uses_home_local_opt() {
        let home = std::env::var("HOME").expect("HOME");
        let p = app_install_root("YohuAdbTools").expect("os install root");
        assert_eq!(
            p,
            PathBuf::from(home)
                .join(".local")
                .join("opt")
                .join("YohuAdbTools")
        );
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
