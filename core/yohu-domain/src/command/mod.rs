//! 命令域模块索引。

pub mod default_library;
pub mod executor;
pub mod library;

pub use default_library::default_library;
pub use executor::{
    combine_output, run_command, run_line, split_command_line, strip_leading_adb, CommandRun,
    GroupExecutor, GroupRunEvent, RunError, Runner,
};
pub use library::{
    placeholder_arity, CommandDefinition, CommandGroup, CommandLibrary, LibraryError,
};
