//! 命令域模块索引。

pub mod default_library;
pub mod executor;
pub mod import;
pub mod library;

pub use default_library::default_library;
pub use executor::{
    combine_output, device_offline_text, run_command, run_line, split_command_line,
    strip_leading_adb, CommandRun, GroupExecutor, GroupRunEvent, RunError, RunShell, Runner,
    ScheduledStep, CANDIDATES_FAILED, SHELL_ENDED, SHELL_EXEC, SHELL_HANDSHAKE, SHELL_NO_STDIN,
    SHELL_NO_STDOUT, TOOL_UNAVAILABLE, UNSUPPORTED_SHELL,
};
pub use import::{
    apply_import, combine_imports, parse_import_text, preview_import, screen_import_paths,
    ImportScreen,
};
pub use library::{
    align_params, insert_placeholder, next_placeholder_index, param_description, placeholder_arity,
    placeholder_slots, placeholder_tokens, preview_fill, step_param_slots, CommandBlock,
    CommandDefinition, CommandGroup, CommandLibrary, CommandParam, CommandStep, LibraryEntry,
    LibraryError, PlaceholderToken, StepParamSlot,
};
