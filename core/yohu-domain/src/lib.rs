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
pub mod log_bind;
pub mod log_filter;
pub mod log_format;
pub mod log_signal;
pub mod mirror;
pub mod path;
pub mod path_input;
pub mod safety;
pub mod settings;

pub use applog::{AppLog, AppLogEntry, LogLevel};
pub use catalog::{
    catalog_after_scan, device_display_name, device_is_online, device_is_unauthorized,
    lookup_selected_devices,
};
pub use command::{
    align_params, apply_import, combine_imports, combine_output, default_library,
    device_offline_text, insert_placeholder, next_placeholder_index, param_description,
    parse_import_text, placeholder_arity, placeholder_slots, placeholder_tokens, preview_fill,
    preview_import, run_command, run_line, screen_import_paths, split_command_line,
    step_param_slots, strip_leading_adb, CommandBlock, CommandDefinition, CommandGroup,
    CommandLibrary, CommandParam, CommandRun, CommandStep, GroupExecutor, GroupRunEvent,
    ImportScreen, LibraryEntry, LibraryError, PlaceholderToken, RunError, RunShell, Runner,
    ScheduledStep, StepParamSlot, CANDIDATES_FAILED, SHELL_ENDED, SHELL_EXEC, SHELL_HANDSHAKE,
    SHELL_NO_STDIN, SHELL_NO_STDOUT, TOOL_UNAVAILABLE, UNSUPPORTED_SHELL,
};
pub use datetime::{
    canonicalize_datetime, canonicalize_datetime_seconds, clock_display_len, format_datetime,
    format_datetime_seconds, format_log_ts, is_zone_token, DATETIME_DISPLAY_LEN,
    DATETIME_SECONDS_LEN, TIME_DISPLAY_LEN, TIME_MILLIS_DISPLAY_LEN,
};
pub use focus::{
    assert_device_online, assert_targets_online, device_not_online_text, reconcile_focus,
    DEVICE_UNSELECTED,
    DeviceSessionError, SelectionMode,
};
pub use log_bind::{
    pid_set_of, rebind_pids, to_wire_filter, FilterScopeInput, PidBinding, HISTORY_PID_CAP,
};
pub use log_filter::{
    is_log_level_letter, log_filter_matches, normalize_log_levels, parse_tag_needles,
    tag_filter_active, LOG_LEVEL_LETTERS,
};
pub use log_format::format_log_line;
pub use log_signal::{scan_signal, SignalHit, SignalKind};
pub use mirror::{
    apply_protocol, is_tcp_connection, params_of, start_encode, start_force_forward,
    MirrorEncodeParams, USB_ENCODE, WIFI_ENCODE,
};
pub use path::{
    invalid_name_text, join_path, not_absolute_text, parent_of, path_segments, traversal_text,
    PathError, RemotePath,
};
pub use path_input::{parse_remote_path, PathParseErr, PathParseOk, PathStrategy};
pub use safety::{
    outside_root_text, parent_within_safety, validate_entry_name, SafetyError, SafetyRoot,
    ENTRY_NAME_EMPTY, ENTRY_NAME_SEPARATOR,
};
pub use settings::{apply_setting, SettingError};
