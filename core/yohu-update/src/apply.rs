//! 覆盖安装：等当前进程退出后静默跑 NSIS `/S`，再拉起新主程序。

use std::path::{Path, PathBuf};
use std::process::Stdio;

#[cfg(windows)]
use std::io::Write;

#[cfg(not(target_os = "macos"))]
use yohu_protocol::DATA_DIR_NAME;
use yohu_protocol::PRODUCT_NAME;
#[cfg(not(target_os = "macos"))]
use yohu_runtime::app_data_root;

use crate::download::assert_cached_installer;
use crate::error::UpdateError;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
#[cfg(windows)]
const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;

#[cfg(any(windows, test))]
const APPLY_PS1: &str = r#"param(
  [Parameter(Mandatory=$true)][int]$WaitPid,
  [Parameter(Mandatory=$true)][string]$Setup,
  [Parameter(Mandatory=$true)][string]$App
)
$ErrorActionPreference = 'Continue'
$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
  $proc = Get-Process -Id $WaitPid -ErrorAction SilentlyContinue
  if (-not $proc) { break }
  Start-Sleep -Seconds 1
}
if (-not (Test-Path -LiteralPath $Setup)) { exit 2 }
$p = Start-Process -FilePath $Setup -ArgumentList '/S' -Wait -PassThru
if ($null -eq $p) { exit 3 }
if ($p.ExitCode -ne 0) { exit $p.ExitCode }
Start-Sleep -Seconds 1
if (Test-Path -LiteralPath $App) {
  Start-Process -FilePath $App
}
exit 0
"#;

/// NSIS per-user 安装后的主程序（Windows：`%LOCALAPPDATA%\YohuAdbTools\YohuAdbTools.exe`）。
/// macOS：`/Applications/YohuAdbTools.app/Contents/MacOS/YohuAdbTools`。
pub fn installed_exe_path() -> PathBuf {
    #[cfg(windows)]
    {
        app_data_root(DATA_DIR_NAME).join(format!("{PRODUCT_NAME}.exe"))
    }
    #[cfg(target_os = "macos")]
    {
        PathBuf::from("/Applications")
            .join(format!("{PRODUCT_NAME}.app"))
            .join("Contents")
            .join("MacOS")
            .join(PRODUCT_NAME)
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        app_data_root(DATA_DIR_NAME).join(PRODUCT_NAME)
    }
}

/// 拉起覆盖安装：Windows 等进程退出后静默 `/S`；macOS 打开 DMG（用户拖入 Applications）。
/// 返回是否应退出当前进程（Windows 必须退出才能覆盖主程序）。
pub fn spawn_overlay_install(
    installer: &Path,
    app_pid: u32,
    relaunch_exe: &Path,
) -> Result<bool, UpdateError> {
    #[cfg(windows)]
    {
        spawn_overlay_install_windows(installer, app_pid, relaunch_exe)?;
        Ok(true)
    }
    #[cfg(target_os = "macos")]
    {
        let _ = (app_pid, relaunch_exe);
        let installer = assert_cached_installer(installer)?;
        std::process::Command::new("open")
            .arg(installer)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| UpdateError::Io(e.to_string()))?;
        Ok(false)
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = (installer, app_pid, relaunch_exe);
        Err(UpdateError::NotWindows)
    }
}

#[cfg(windows)]
fn spawn_overlay_install_windows(
    installer: &Path,
    app_pid: u32,
    relaunch_exe: &Path,
) -> Result<(), UpdateError> {
    let installer = assert_cached_installer(installer)?;
    let cache = crate::download::update_cache_dir();
    std::fs::create_dir_all(&cache).map_err(|e| UpdateError::Io(e.to_string()))?;
    let script = cache.join("apply-update.ps1");
    {
        let mut file =
            std::fs::File::create(&script).map_err(|e| UpdateError::Io(e.to_string()))?;
        file.write_all(APPLY_PS1.as_bytes())
            .map_err(|e| UpdateError::Io(e.to_string()))?;
    }

    let installer_s = path_arg(&installer)?;
    let app_s = path_arg(relaunch_exe)?;
    let script_s = path_arg(&script)?;

    let mut cmd = std::process::Command::new("cmd");
    cmd.args([
        "/C",
        "start",
        "",
        "/MIN",
        "powershell.exe",
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        &script_s,
        "-WaitPid",
        &app_pid.to_string(),
        "-Setup",
        &installer_s,
        "-App",
        &app_s,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB);
    cmd.spawn().map_err(|e| UpdateError::Io(e.to_string()))?;
    Ok(())
}

#[cfg(windows)]
fn path_arg(path: &Path) -> Result<String, UpdateError> {
    path.to_str()
        .map(str::to_string)
        .ok_or(UpdateError::InvalidInstaller)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installed_exe_is_under_product_install_root() {
        let p = installed_exe_path();
        #[cfg(windows)]
        {
            assert!(p.ends_with("YohuAdbTools.exe"));
            assert!(p
                .parent()
                .map(|d| d.ends_with("YohuAdbTools"))
                .unwrap_or(false));
        }
        #[cfg(target_os = "macos")]
        {
            assert!(p.ends_with("YohuAdbTools"));
            assert!(p.to_string_lossy().contains("YohuAdbTools.app"));
        }
    }

    #[test]
    fn apply_script_waits_then_silent_setup() {
        assert!(APPLY_PS1.contains("Get-Process -Id $WaitPid"));
        assert!(APPLY_PS1.contains("/S"));
        assert!(APPLY_PS1.contains("Start-Process -FilePath $App"));
    }
}
