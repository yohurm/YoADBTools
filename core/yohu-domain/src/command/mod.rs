//! 命令域模块索引。

pub mod default_library;
pub mod executor;
pub mod library;

pub use default_library::default_library;
pub use executor::{
    combine_output, run_command, run_line, split_command_line, strip_leading_adb, CommandRun,
    GroupExecutor, GroupRunEvent, RunError, Runner, ScheduledStep,
};
pub use library::{
    align_params, insert_placeholder, next_placeholder_index, param_description, placeholder_arity,
    placeholder_slots, placeholder_tokens, preview_fill, templates_slots, CommandBlock,
    CommandDefinition, CommandGroup,
    CommandLibrary, CommandStep, LibraryEntry, LibraryError, PlaceholderToken,
};
