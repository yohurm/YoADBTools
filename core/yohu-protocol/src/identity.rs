//! 应用身份与路径目录契约（关于 / 标题栏 / 安装包 / 数据根共用）。
//!
//! 常量是产品单源：文件夹名、模块数据目录、展示名不得在壳或 UI 再写一份。
//! 版本号运行时由 `yohu-adbtools` 填入 [`AppIdentity::with_version`]（`CARGO_PKG_VERSION`）。

use serde::{Deserialize, Serialize};

use crate::settings::AppSettings;

/// 产品名 / 主程序文件名 / LocalAppData 目录名。
pub const PRODUCT_NAME: &str = "YohuAdbTools";
/// 窗口标题、状态栏、关于页展示名。
pub const DISPLAY_NAME: &str = "Yohu ADB Tools";
/// 包标识（Tauri `identifier`）。
pub const IDENTIFIER: &str = "com.yohu.adbtools";
/// 一句话定位（关于页）。
pub const DESCRIPTION: &str = "设备工具工作台";
/// 版权行。
pub const COPYRIGHT: &str = "© 2026 Yohu";
/// 产品家园目录名：`%LOCALAPPDATA%\<DATA_DIR_NAME>\`
pub const DATA_DIR_NAME: &str = PRODUCT_NAME;

/// 设备路径安全根（ADR-v6-013）。UI 面包屑夹紧与 domain `SafetyRoot::default` 共用。
pub mod safety_root {
    pub const SDCARD: &str = "/sdcard";
    pub const STORAGE: &str = "/storage";
    pub const ALL: &[&str] = &[SDCARD, STORAGE];
}

/// 官方 scrcpy-server 钉死版本（协议无前后兼容）。
pub mod scrcpy {
    pub const SERVER_VERSION: &str = "4.1";
    pub const DEVICE_SERVER_PATH: &str = "/data/local/tmp/scrcpy-server.jar";
    pub const DEVICE_NAME_FIELD_LENGTH: usize = 64;
    pub const VIDEO_PACKET_HEADER_LENGTH: usize = 12;
    pub const CODEC_H264: u32 = 0x6832_3634;
    pub const CODEC_H265: u32 = 0x6832_3635;
    pub const CODEC_AV1: u32 = 0x0061_7631;
    /// 设备元数据：视频流关闭（scrcpy dummy fourcc）。
    pub const CODEC_DUMMY_OFF: u32 = 0;
    /// 设备元数据：编码器配置失败（scrcpy dummy fourcc）。
    pub const CODEC_DUMMY_ERROR: u32 = 1;

    pub const PACKET_FLAG_SESSION: u64 = 1 << 63;
    pub const PACKET_FLAG_CONFIG: u64 = 1 << 62;
    pub const PACKET_FLAG_KEY_FRAME: u64 = 1 << 61;
    pub const PACKET_PTS_MASK: u64 = PACKET_FLAG_KEY_FRAME - 1;
    pub const MAX_PACKET_SIZE: u32 = 10 * 1024 * 1024;

    pub const CTRL_INJECT_KEYCODE: u8 = 0;
    pub const CTRL_INJECT_TOUCH: u8 = 2;
    pub const CTRL_BACK_OR_SCREEN_ON: u8 = 4;
    pub const CTRL_EXPAND_NOTIFICATION: u8 = 5;
    pub const CTRL_EXPAND_SETTINGS: u8 = 6;
    pub const CTRL_COLLAPSE_PANELS: u8 = 7;
    pub const CTRL_SET_DISPLAY_POWER: u8 = 10;
    pub const CTRL_ROTATE_DEVICE: u8 = 11;

    pub const ACTION_DOWN: u8 = 0;
    pub const ACTION_UP: u8 = 1;
    pub const ACTION_MOVE: u8 = 2;
    pub const BUTTON_PRIMARY: i32 = 1;
    pub const POINTER_ID_MOUSE: i64 = -1;
    pub const TOUCH_PRESSURE_MAX: u16 = 0xFFFF;
}

/// Android KeyEvent keycode（投屏注入；与 `@yohu/api` `AndroidKey` 对齐）。
pub mod android_key {
    pub const HOME: u32 = 3;
    pub const BACK: u32 = 4;
    pub const VOLUME_UP: u32 = 24;
    pub const VOLUME_DOWN: u32 = 25;
    pub const POWER: u32 = 26;
    pub const APP_SWITCH: u32 = 187;
    pub const BRIGHTNESS_DOWN: u32 = 220;
    pub const BRIGHTNESS_UP: u32 = 221;
    pub const WAKEUP: u32 = 224;
}

/// 模块 id（与 UI `ModuleDescriptor.id`、数据目录 `modules/<id>/` 一致）。
pub mod module_id {
    pub const TERMINAL: &str = "adb-terminal";
    pub const FILES: &str = "file-manager";
    pub const LOGS: &str = "log-analyzer";
    pub const MIRROR: &str = "screen-mirror";
    pub const SETTINGS: &str = "settings";
}

/// 模块导航 / 页眉展示名（与 `ModuleDescriptor.title` 一致；不是目录名）。
pub mod module_title {
    pub const TERMINAL: &str = "命令终端";
    pub const FILES: &str = "文件管理";
    pub const LOGS: &str = "日志分析";
    pub const MIRROR: &str = "投屏显示";
    pub const SETTINGS: &str = "设置";
}

/// 产品家园下的固定段（不随 `data_root` 迁移，除非另注）。
pub mod dir {
    pub const CONFIG: &str = "config";
    pub const SETTINGS_FILE: &str = "settings.json";
    pub const DEVICES_CATALOG: &str = "devices-catalog.json";
    pub const LOGS: &str = "logs";
    pub const DATA: &str = "data";
    pub const CACHE: &str = "cache";
    pub const WEBVIEW: &str = "webview";
    pub const UPDATE: &str = "update";
    pub const TOOLS: &str = "tools";
    pub const ADB: &str = "adb";
    pub const SIDECAR_STAMP: &str = ".sidecar-stamp";
    /// 官方 scrcpy-server 文件名（与 `tools/scrcpy-server`、bundle resources 一致）。
    pub const SCRCPY_SERVER: &str = "scrcpy-server";
    pub const MODULES: &str = "modules";
    pub const LIBRARY_CONFIG: &str = "config";
    pub const LIBRARY_FILE: &str = "library.json";
    pub const EXPORTS: &str = "exports";
    pub const DRAG_OUT: &str = "drag-out";
}

/// 应用身份（`system.info.identity`）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppIdentity {
    pub name: String,
    pub display_name: String,
    pub identifier: String,
    pub version: String,
    pub description: String,
    pub copyright: String,
}

impl AppIdentity {
    /// 用工作区版本填满身份（名称等取本模块常量）。
    pub fn with_version(version: impl Into<String>) -> Self {
        Self {
            name: PRODUCT_NAME.into(),
            display_name: DISPLAY_NAME.into(),
            identifier: IDENTIFIER.into(),
            version: version.into(),
            description: DESCRIPTION.into(),
            copyright: COPYRIGHT.into(),
        }
    }
}

/// 解析后的绝对路径目录（`system.info.paths`）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppPathCatalog {
    /// 产品家园（Windows `%LOCALAPPDATA%\YohuAdbTools`）
    pub local_root: String,
    /// 安装根（Windows `%LOCALAPPDATA%\Programs\YohuAdbTools`）
    pub install_dir: String,
    pub config_dir: String,
    pub settings_file: String,
    pub logs_dir: String,
    /// 数据根（可配置；默认 `local_root/data`）
    pub data_root: String,
    pub cache_dir: String,
    pub webview_dir: String,
    pub update_cache_dir: String,
    pub adb_tools_dir: String,
    pub library_file: String,
    pub exports_dir: String,
    pub drag_out_dir: String,
}

/// `system.info`：关于 / 诊断。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SystemInfo {
    pub identity: AppIdentity,
    pub paths: AppPathCatalog,
    pub adb_path: String,
    pub settings: AppSettings,
    /// 编译目标 OS：`windows` / `macos` / `linux`（`std::env::consts::OS`）。
    pub os: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_serde_snake_case() {
        let id = AppIdentity::with_version("0.1.0");
        let v = serde_json::to_value(&id).expect("identity json");
        assert_eq!(v["name"], PRODUCT_NAME);
        assert_eq!(v["display_name"], DISPLAY_NAME);
        assert_eq!(v["identifier"], IDENTIFIER);
        assert_eq!(v["version"], "0.1.0");
        assert_eq!(v["description"], DESCRIPTION);
        assert_eq!(v["copyright"], COPYRIGHT);
    }

    #[test]
    fn data_dir_name_matches_product() {
        assert_eq!(DATA_DIR_NAME, PRODUCT_NAME);
    }

    #[test]
    fn module_ids_are_stable_path_segments() {
        assert_eq!(module_id::TERMINAL, "adb-terminal");
        assert_eq!(module_id::FILES, "file-manager");
        assert_eq!(module_id::LOGS, "log-analyzer");
        assert_eq!(module_id::MIRROR, "screen-mirror");
        assert_eq!(module_id::SETTINGS, "settings");
        assert_eq!(module_title::TERMINAL, "命令终端");
        assert_eq!(module_title::FILES, "文件管理");
        assert_eq!(module_title::LOGS, "日志分析");
        assert_eq!(module_title::MIRROR, "投屏显示");
        assert_eq!(module_title::SETTINGS, "设置");
        assert_eq!(scrcpy::SERVER_VERSION, "4.1");
        assert_eq!(scrcpy::CODEC_H264, 0x6832_3634);
        assert_eq!(scrcpy::CODEC_DUMMY_OFF, 0);
        assert_eq!(scrcpy::CODEC_DUMMY_ERROR, 1);
        assert_eq!(scrcpy::VIDEO_PACKET_HEADER_LENGTH, 12);
        assert_eq!(scrcpy::PACKET_FLAG_SESSION, 1 << 63);
        assert_eq!(scrcpy::PACKET_FLAG_CONFIG, 1 << 62);
        assert_eq!(scrcpy::CTRL_SET_DISPLAY_POWER, 10);
        assert_eq!(scrcpy::POINTER_ID_MOUSE, -1);
        assert_eq!(scrcpy::TOUCH_PRESSURE_MAX, 0xFFFF);
        assert_eq!(android_key::HOME, 3);
        assert_eq!(android_key::BACK, 4);
        assert_eq!(android_key::VOLUME_UP, 24);
        assert_eq!(android_key::VOLUME_DOWN, 25);
        assert_eq!(android_key::POWER, 26);
        assert_eq!(android_key::APP_SWITCH, 187);
        assert_eq!(android_key::BRIGHTNESS_DOWN, 220);
        assert_eq!(android_key::BRIGHTNESS_UP, 221);
        assert_eq!(android_key::WAKEUP, 224);
        assert_eq!(dir::SCRCPY_SERVER, "scrcpy-server");
        assert_eq!(dir::CONFIG, "config");
        assert_eq!(dir::CACHE, "cache");
        assert_eq!(dir::WEBVIEW, "webview");
        assert_eq!(dir::UPDATE, "update");
        assert_eq!(dir::SIDECAR_STAMP, ".sidecar-stamp");
        assert_eq!(dir::DEVICES_CATALOG, "devices-catalog.json");
    }

    #[test]
    fn safety_roots_are_absolute_device_paths() {
        assert_eq!(safety_root::ALL, &["/sdcard", "/storage"]);
        for root in safety_root::ALL {
            assert!(root.starts_with('/'));
            assert!(!root.contains(".."));
        }
    }
}
