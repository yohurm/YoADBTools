//! 覆盖安装：等当前进程退出后静默跑 NSIS，再拉起新主程序。
//!
//! Windows 对照 Tauri plugin-updater（`/S /UPDATE /NS`）与 Omaha（失败退避重试 + 日志）。
//! 助手脱离作业对象；不加 `/R`，由助手校验主程序后再拉起。

mod plan;
mod script;

pub use plan::{installed_exe_path, ApplyPlan, NSIS_OVERLAY_ARGS};

use std::path::Path;
use std::process::Stdio;

use crate::artifact::InstallerKind;
use crate::download::assert_cached_installer;
use crate::error::UpdateError;

/// 拉起覆盖安装。返回是否应退出当前进程（Windows 必须退出才能覆盖主程序）。
pub fn spawn_overlay_install(
    installer: &Path,
    app_pid: u32,
    relaunch_exe: &Path,
) -> Result<bool, UpdateError> {
    let installer = assert_cached_installer(installer)?;
    let kind = installer
        .file_name()
        .and_then(|n| n.to_str())
        .and_then(InstallerKind::from_name)
        .ok_or(UpdateError::InvalidInstaller)?;
    match kind {
        InstallerKind::Nsis => {
            #[cfg(windows)]
            {
                spawn_windows(
                    &ApplyPlan::new(installer, app_pid, relaunch_exe.to_path_buf()),
                )?;
                Ok(true)
            }
            #[cfg(not(windows))]
            {
                let _ = (app_pid, relaunch_exe);
                Err(UpdateError::UnsupportedOs)
            }
        }
        InstallerKind::Dmg => {
            #[cfg(target_os = "macos")]
            {
                let _ = (app_pid, relaunch_exe);
                std::process::Command::new("open")
                    .arg(&installer)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .map_err(|e| UpdateError::Io(e.to_string()))?;
                Ok(false)
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (app_pid, relaunch_exe);
                Err(UpdateError::UnsupportedOs)
            }
        }
    }
}

#[cfg(windows)]
fn spawn_windows(plan: &ApplyPlan) -> Result<(), UpdateError> {
    use std::io::Write;
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;

    let cache = crate::download::update_cache_dir();
    std::fs::create_dir_all(&cache).map_err(|e| UpdateError::Io(e.to_string()))?;
    let script = cache.join("apply-update.ps1");
    {
        let mut file =
            std::fs::File::create(&script).map_err(|e| UpdateError::Io(e.to_string()))?;
        file.write_all(script::apply_script().as_bytes())
            .map_err(|e| UpdateError::Io(e.to_string()))?;
    }

    let script_s = path_arg(&script)?;
    let installer_s = path_arg(&plan.installer)?;
    let app_s = path_arg(&plan.relaunch)?;
    let log_s = path_arg(&plan.log_path)?;
    let pid = plan.wait_pid.to_string();

    let mut cmd = std::process::Command::new("powershell.exe");
    cmd.args([
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        &script_s,
        "-WaitPid",
        &pid,
        "-Setup",
        &installer_s,
        "-App",
        &app_s,
        "-Log",
        &log_s,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB);
    cmd.spawn().map_err(|e| UpdateError::Io(e.to_string()))?;
    Ok(())
}

#[cfg(windows)]
fn path_arg(path: &Path) -> Result<String, UpdateError> {
    path.to_str()
        .map(str::to_string)
        .ok_or(UpdateError::InvalidInstaller)
}
