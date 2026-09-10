//! 覆盖安装计划：产物路径、等待 PID、拉起目标、NSIS 开关。

use std::path::PathBuf;

#[cfg(not(target_os = "macos"))]
use yohu_protocol::DATA_DIR_NAME;
use yohu_protocol::PRODUCT_NAME;
#[cfg(not(target_os = "macos"))]
use yohu_runtime::app_install_root;

use crate::download::update_cache_dir;

/// Tauri NSIS 应用内更新开关（对照 plugin-updater）。
///
/// - `/S` 静默
/// - `/UPDATE` 跳过「先卸载再装」重装页
/// - `/NS` 静默时不新建桌面快捷方式
///
/// 不加 `/R`：助手校验主程序存在后再拉起，避免与 NSIS `.onInstSuccess` 双启动。
pub const NSIS_OVERLAY_ARGS: &[&str] = &["/S", "/UPDATE", "/NS"];

/// 等进程退出的上限。
pub const WAIT_PID_MINUTES: u32 = 5;
/// 进程消失后再等，避开 Windows 主程序句柄未放。
pub const SETTLE_SECS: u32 = 2;
/// setup 失败重试次数（Omaha：忙/锁则退避）。
pub const SETUP_TRIES: u32 = 4;

/// 一次覆盖安装的冻结参数。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplyPlan {
    pub installer: PathBuf,
    pub wait_pid: u32,
    pub relaunch: PathBuf,
    pub log_path: PathBuf,
}

impl ApplyPlan {
    pub fn new(installer: PathBuf, wait_pid: u32, relaunch: PathBuf) -> Self {
        Self {
            installer,
            wait_pid,
            relaunch,
            log_path: apply_log_path(),
        }
    }
}

pub fn apply_log_path() -> PathBuf {
    update_cache_dir().join("apply.log")
}

/// NSIS per-user 安装后的主程序。
pub fn installed_exe_path() -> PathBuf {
    #[cfg(windows)]
    {
        app_install_root(DATA_DIR_NAME).join(format!("{PRODUCT_NAME}.exe"))
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
        app_install_root(DATA_DIR_NAME).join(PRODUCT_NAME)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn nsis_flags_match_tauri_updater() {
        assert_eq!(NSIS_OVERLAY_ARGS, &["/S", "/UPDATE", "/NS"]);
        assert!(!NSIS_OVERLAY_ARGS.contains(&"/R"));
    }

    #[test]
    fn plan_writes_log_under_update_cache() {
        let plan = ApplyPlan::new(
            PathBuf::from("C:/cache/setup.exe"),
            42,
            PathBuf::from("C:/Programs/YohuAdbTools.exe"),
        );
        assert_eq!(plan.wait_pid, 42);
        assert!(plan.log_path.ends_with("apply.log"));
    }

    #[test]
    fn installed_exe_is_under_product_install_root() {
        let p = installed_exe_path();
        #[cfg(windows)]
        {
            assert!(p.ends_with("YohuAdbTools.exe"));
            let parent = p.parent().expect("exe parent");
            assert!(parent.ends_with("YohuAdbTools"));
            assert!(parent
                .parent()
                .map(|d| d.ends_with("Programs"))
                .unwrap_or(false));
        }
        #[cfg(target_os = "macos")]
        {
            assert!(p.ends_with("YohuAdbTools"));
            assert!(p.to_string_lossy().contains("YohuAdbTools.app"));
        }
    }
}
