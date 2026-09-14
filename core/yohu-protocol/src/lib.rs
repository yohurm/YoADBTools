//! yohu-protocol — IPC wire 类型层（ADR-v6：前后端共享的类型定义依据）。
//!
//! 本 crate 是依赖图最底层：**只含 serde 数据结构，零 IO、零业务逻辑**。
//! 前端 `@yohu/api` 手工对齐本文件，并由双向契约测试（fixture JSON）守护。

pub mod device;
pub mod error;
pub mod events;
pub mod identity;
pub mod invoke;
pub mod library_dto;
pub mod log;
pub mod mirror;
pub mod process;
pub mod settings;
pub mod transfer;
pub mod update;

/// 共享 `true` 默认填充（被 settings 的 serde `default` 引用，避免每模块重复定义）。
pub(crate) fn default_true() -> bool {
    true
}

pub use device::*;
pub use error::*;
pub use events::*;
pub use identity::*;
pub use invoke::*;
pub use library_dto::*;
pub use log::*;
pub use mirror::*;
pub use process::*;
pub use settings::*;
pub use transfer::*;
pub use update::*;
