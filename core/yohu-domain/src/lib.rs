//! yohu-domain — 纯领域层。
//!
//! **高内聚边界**：本 crate 只含业务规则，不含进程/文件/网络 IO。
//! ADB 执行能力经 [`command::Runner`] 端口注入（由 yohu-adb 实现）。
//! 依赖方向：yohu-domain → yohu-protocol（禁止反向）。

pub mod applog;
pub mod catalog;
pub mod command;
pub mod datetime;
pub mod focus;
pub mod log_filter;
pub mod log_format;
pub mod mirror;
pub mod safety;
pub mod settings;

pub use applog::{AppLog, AppLogEntry, LogLevel};
pub use catalog::{catalog_after_scan, device_display_name, lookup_selected_devices};
pub use datetime::{
    canonicalize_datetime, canonicalize_datetime_seconds, format_datetime, format_datetime_seconds,
    DATETIME_DISPLAY_LEN, DATETIME_SECONDS_LEN,
};
pub use command::{
    combine_output, default_library, placeholder_arity, run_command, run_line, split_command_line,
    strip_leading_adb, CommandBlock, CommandDefinition, CommandGroup, CommandLibrary, CommandRun,
    CommandStep, GroupExecutor, GroupRunEvent, LibraryEntry, LibraryError, RunError, Runner,
    ScheduledStep,
};
pub use focus::{
    assert_device_online, assert_targets_online, reconcile_focus, DeviceSessionError, SelectionMode,
};
pub use log_filter::{level_rank, log_filter_matches};
pub use log_format::format_log_line;
pub use mirror::{
    apply_protocol, encoder_limits, is_tcp_connection, params_of, start_encode,
    start_force_forward, EncoderLimits, MirrorEncodeParams, USB_ENCODE, WIFI_ENCODE,
};
pub use safety::{validate_entry_name, PathError, RemotePath, SafetyError, SafetyRoot};
pub use settings::apply_setting;
