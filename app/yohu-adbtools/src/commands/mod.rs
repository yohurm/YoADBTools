//! 命令层：Tauri invoke 处理器。
//!
//! **薄命令层纪律**（ADR-v6-005）：只做参数反序列化 → 鉴权 → 服务/core → [`ipc_map`] 映射。
//! 映射函数在 crate 根 [`crate::ipc_map`]；本模块再导出给命令文件。

pub mod adb;
pub mod boot;
pub mod commandlib;
pub mod device;
pub mod files;
pub mod log;
pub mod mirror;
pub mod settings;
pub mod system;
pub mod terminal;
pub mod update;

pub use crate::ipc_map::{
    ipc, ipc_adb, ipc_catalog, ipc_code, ipc_dnd, ipc_eval, ipc_file, ipc_group, ipc_library_store,
    ipc_log, ipc_mirror, ipc_present, ipc_update,
};
