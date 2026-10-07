//! yohu-files — 文件模块服务。
//!
//! 高内聚边界：浏览/传输/变更；**危险路径校验在 core 侧强制**（ADR-v6-013），
//! 不信任 UI 传来的路径。

mod browse;
mod fault;
mod guard;
mod mutate;
mod transfer;
mod tree;

pub use browse::FileBrowser;
pub use fault::{
    already_exists_text, illegal_path_text, local_failed_text, local_not_found_text,
    not_a_directory_text, permission_denied_text, read_only_text, readlink_unparseable_text,
    remote_failed_text, remote_not_found_text, FileError, PROGRESS_JOIN,
};
pub use mutate::FileMutator;
pub use transfer::{TransferRunner, TransferSpec};
pub use tree::{TreeEntry, MAX_TREE_ENTRIES};
