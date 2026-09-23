//! yohu-adb — ADB 客户端（设备运输层）。
//!
//! 包装官方 platform-tools `adb`（ADR-v6-008：不重实现协议；`DeviceShell` 见 ADR-v6-033）。
//! 进程生命周期在 `yohu-runtime`；本 crate 做 adb 语义、解析（devices/ls/ps/packages/readlink）与 `Runner` 适配。
//! 自愈扫描协作在 `scan`；运输门面与 `Runner` 仍在 `AdbClient`。

pub mod client;
mod device_shell;
pub mod error;
pub mod parse;
mod scan;
pub mod shell;
pub mod status;
pub mod tool;

pub use client::{AdbClient, BROWSE_LIST_TIMEOUT_MS};
pub use device_shell::{DeviceShell, DeviceShellError};
pub use error::AdbError;
pub use parse::browse::BrowseListRaw;
pub use parse::readlink::ReadlinkF;
pub use shell::shell_quote;
pub use status::DeviceStatusHub;
pub use tool::{adb_file_name, repo_sidecar_adb, ToolResolver, ADB_FILES};
pub use yohu_runtime::ChildHandle;
