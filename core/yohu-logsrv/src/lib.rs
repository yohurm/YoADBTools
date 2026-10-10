//! yohu-logsrv — logcat 采集服务（ADR-v6-006/007 的核心落地）。
//!
//! 高内聚边界：本 crate 只负责「单流采集 + 共享环形缓冲 + 窗口命中索引 + 批量推送 + 进程索引 + 环快照导出」。
//! 槽位持意图与代际资源；跟流工人可同世代重启。过滤定义在 UI，命中索引在环旁边（ADR-v6-041）。

mod assembler;
mod batch;
mod capture;
mod export;
mod follow;
mod index;
mod parse;
mod ring;
mod stack_trace;
mod task;
mod windows;

pub use capture::{CaptureService, LogError};
