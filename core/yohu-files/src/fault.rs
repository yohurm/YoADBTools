//! 设备侧命令失败分类。浏览 / 变更 / 传输共用。
//!
//! 错误只带分类与路径/计数/层数；禁止把 `ls`/`rm`/`readlink` stderr 原文交给 UI。

use thiserror::Error;
use tokio_util::sync::CancellationToken;
use yohu_adb::parse::remote_stderr::{self, RemoteStderr};
use yohu_adb::AdbError;

/// 「路径非法」。已是绝对路径，但没有可操作的条目名。
pub fn illegal_path_text(path: &str) -> String {
    format!("路径非法: {path}")
}
/// 「远端不存在」。
pub fn remote_not_found_text(path: &str) -> String {
    format!("远端不存在: {path}")
}
/// 「不是目录」。
pub fn not_a_directory_text(path: &str) -> String {
    format!("不是目录: {path}")
}
/// 「没有权限」。
pub fn permission_denied_text(path: &str) -> String {
    format!("没有权限: {path}")
}
/// 「文件系统只读」。
pub fn read_only_text(path: &str) -> String {
    format!("文件系统只读: {path}")
}
/// 「路径已存在」。
pub fn already_exists_text(path: &str) -> String {
    format!("路径已存在: {path}")
}
/// 「远端操作失败」。
pub fn remote_failed_text(path: &str) -> String {
    format!("远端操作失败: {path}")
}
/// 「本地路径不存在」。
pub fn local_not_found_text(path: &str) -> String {
    format!("本地路径不存在: {path}")
}
/// 「本地操作失败」。
pub fn local_failed_text(path: &str) -> String {
    format!("本地操作失败: {path}")
}
/// 「无法识别路径解析结果」。
pub fn readlink_unparseable_text(path: &str) -> String {
    format!("无法识别路径解析结果: {path}")
}
/// 「传输进度任务已中断」。
pub const PROGRESS_JOIN: &str = "传输进度任务已中断";

/// 文件服务错误。变体即分类；载荷是路径、计数、层数或运输层 `Adb`，禁止装用户句子。
#[derive(Debug, Error)]
pub enum FileError {
    /// 句子见 [`yohu_domain::not_absolute_text`]。
    #[error("{}", yohu_domain::not_absolute_text(.0))]
    NotAbsolute(String),
    /// 句子见 [`yohu_domain::traversal_text`]。
    #[error("{}", yohu_domain::traversal_text(.0))]
    Traversal(String),
    /// 句子见 [`yohu_domain::invalid_name_text`]。
    #[error("{}", yohu_domain::invalid_name_text(.0))]
    InvalidName(String),
    /// 已是绝对路径，但没有可操作的条目名（根路径、没有上级）。不是代数拒绝。
    #[error("{}", illegal_path_text(.0))]
    Path(String),
    /// 句子见 [`yohu_domain::outside_root_text`]。
    #[error("{}", yohu_domain::outside_root_text(.0))]
    OutsideRoot(String),
    #[error("浏览会话未打开")]
    NotAttached,
    #[error("{}", remote_not_found_text(.0))]
    RemoteNotFound(String),
    #[error("{}", not_a_directory_text(.0))]
    NotADirectory(String),
    #[error("{}", permission_denied_text(.0))]
    PermissionDenied(String),
    #[error("{}", read_only_text(.0))]
    ReadOnly(String),
    #[error("{}", already_exists_text(.0))]
    AlreadyExists(String),
    #[error("{}", remote_failed_text(.0))]
    RemoteFailed(String),
    #[error("{}", local_not_found_text(.0))]
    LocalNotFound(String),
    #[error("{}", local_failed_text(.0))]
    Local(String),
    #[error("传输进度通道已关闭")]
    ProgressClosed,
    #[error("{}", PROGRESS_JOIN)]
    ProgressJoin,
    #[error("没有可拖出的项目: {0}")]
    EmptyTree(String),
    #[error("拖出目录超过 {0} 项")]
    TreeLimit(usize),
    #[error("拖出目录超过 {0} 层")]
    TreeDepth(u32),
    /// 浏览 stdout 没有协议标记。不是远端命令失败。
    #[error("浏览结果无法识别: {0}")]
    BrowseMalformed(String),
    /// `readlink -f` 的输出无法识别。不是远端命令失败。
    #[error("{}", readlink_unparseable_text(.0))]
    ReadlinkUnparseable(String),
    /// 仅手构运输失败（取消 / 掉线 / 超时 / IO）。`BadExit` 必须先走 `file_error_from_adb`。
    #[error("{0}")]
    Adb(AdbError),
}

/// 把 ADB 失败收成 `FileError`。未分类 BadExit 走 `RemoteFailed`，不带 stderr。
/// stderr 分类在 `yohu-adb`，与 `readlink` 同一份针。
pub(crate) fn file_error_from_adb(path: &str, err: AdbError) -> FileError {
    match err {
        AdbError::BadExit { stderr, .. } => match remote_stderr::classify(&stderr) {
            Some(RemoteStderr::NotFound) => FileError::RemoteNotFound(path.to_string()),
            Some(RemoteStderr::NotADirectory) => FileError::NotADirectory(path.to_string()),
            Some(RemoteStderr::PermissionDenied) => FileError::PermissionDenied(path.to_string()),
            Some(RemoteStderr::ReadOnly) => FileError::ReadOnly(path.to_string()),
            Some(RemoteStderr::AlreadyExists) => FileError::AlreadyExists(path.to_string()),
            None => FileError::RemoteFailed(path.to_string()),
        },
        AdbError::Cancelled
        | AdbError::DeviceOffline(_)
        | AdbError::NotOnline(_)
        | AdbError::Timeout
        | AdbError::Io(_)
        | AdbError::Truncated
        | AdbError::PumpPanic
        | AdbError::Shell(_)
        | AdbError::UnsupportedShell
        | AdbError::ToolUnavailable
        | AdbError::CandidatesFailed => FileError::Adb(err),
    }
}

pub(crate) fn file_error_from_browse(path: &str, err: yohu_adb::BrowseListError) -> FileError {
    match err {
        yohu_adb::BrowseListError::Adb(adb) => file_error_from_adb(path, adb),
        yohu_adb::BrowseListError::Parse(parse) => file_error_from_browse_parse(path, parse),
    }
}

/// 帧解析失败。`LsFailed` 仍走 stderr 分类；路径走不通是远端不存在；帧坏了单独成类。
pub(crate) fn file_error_from_browse_parse(
    path: &str,
    err: yohu_adb::BrowseParseError,
) -> FileError {
    match err {
        yohu_adb::BrowseParseError::LsFailed { exit_code, stderr } => {
            file_error_from_adb(path, AdbError::BadExit { exit_code, stderr })
        }
        yohu_adb::BrowseParseError::ResolveFailed => {
            tracing::warn!(path, "无法解析远端路径");
            FileError::RemoteNotFound(path.to_string())
        }
        yohu_adb::BrowseParseError::Malformed => {
            tracing::warn!(path, "浏览结果无法识别");
            FileError::BrowseMalformed(path.to_string())
        }
    }
}

/// 取消令牌已触发。过期世代仍直接返回 `AdbError::Cancelled`，不走这里。
pub(crate) fn reject_if_cancelled(cancel: &CancellationToken) -> Result<(), FileError> {
    if cancel.is_cancelled() {
        Err(FileError::Adb(AdbError::Cancelled))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_ls_no_such_file() {
        let stderr = "ls: /sdcard/Android/data/com.ggec/: No such file or directory";
        let err = file_error_from_adb(
            "/sdcard/Android/data/com.ggec",
            AdbError::BadExit {
                exit_code: 1,
                stderr: stderr.into(),
            },
        );
        assert!(matches!(err, FileError::RemoteNotFound(_)));
        assert_eq!(
            err.to_string(),
            remote_not_found_text("/sdcard/Android/data/com.ggec")
        );
        assert!(!err.to_string().contains("No such file"));
    }

    #[test]
    fn classifies_not_dir_permission_readonly_exists() {
        let cases = [
            (
                "ls: /sdcard/a.txt: Not a directory",
                FileError::NotADirectory("/sdcard/a.txt".into()),
            ),
            (
                "rm: /sdcard/x: Permission denied",
                FileError::PermissionDenied("/sdcard/x".into()),
            ),
            (
                "mkdir: Read-only file system",
                FileError::ReadOnly("/sdcard".into()),
            ),
            (
                "touch: file exists",
                FileError::AlreadyExists("/sdcard".into()),
            ),
        ];
        for (stderr, expected) in cases {
            let err = file_error_from_adb(
                match &expected {
                    FileError::NotADirectory(path)
                    | FileError::PermissionDenied(path)
                    | FileError::ReadOnly(path)
                    | FileError::AlreadyExists(path) => path,
                    _ => unreachable!(),
                },
                AdbError::BadExit {
                    exit_code: 1,
                    stderr: stderr.into(),
                },
            );
            assert_eq!(err.to_string(), expected.to_string());
        }
    }

    #[test]
    fn unknown_bad_exit_is_named_without_stderr() {
        let err = file_error_from_adb(
            "/sdcard",
            AdbError::BadExit {
                exit_code: 127,
                stderr: "toybox: unknown".into(),
            },
        );
        assert!(matches!(err, FileError::RemoteFailed(ref p) if p == "/sdcard"));
        assert_eq!(err.to_string(), remote_failed_text("/sdcard"));
        assert!(!err.to_string().contains("toybox"));
        assert!(!err.to_string().contains("127"));
    }

    #[test]
    fn browse_frame_failures_are_not_remote_failed() {
        let unresolved = file_error_from_browse_parse(
            "/sdcard/missing",
            yohu_adb::BrowseParseError::ResolveFailed,
        );
        assert!(matches!(unresolved, FileError::RemoteNotFound(ref p) if p == "/sdcard/missing"));
        assert_eq!(
            unresolved.to_string(),
            remote_not_found_text("/sdcard/missing")
        );

        let malformed =
            file_error_from_browse_parse("/sdcard", yohu_adb::BrowseParseError::Malformed);
        assert!(matches!(malformed, FileError::BrowseMalformed(ref p) if p == "/sdcard"));
        assert_eq!(malformed.to_string(), "浏览结果无法识别: /sdcard");
        assert!(!malformed.to_string().contains("远端操作失败"));

        let missing = file_error_from_browse_parse(
            "/sdcard/nope",
            yohu_adb::BrowseParseError::LsFailed {
                exit_code: 1,
                stderr: "ls: /sdcard/nope: No such file or directory".into(),
            },
        );
        assert!(matches!(missing, FileError::RemoteNotFound(ref p) if p == "/sdcard/nope"));
        assert!(!missing.to_string().contains("No such file"));
    }

    #[test]
    fn cancelled_and_offline_stay_adb() {
        assert!(matches!(
            file_error_from_adb("/sdcard", AdbError::Cancelled),
            FileError::Adb(AdbError::Cancelled)
        ));
        assert!(matches!(
            file_error_from_adb("/sdcard", AdbError::DeviceOffline("gone".into())),
            FileError::Adb(AdbError::DeviceOffline(_))
        ));
        assert!(matches!(
            file_error_from_adb("/sdcard", AdbError::Timeout),
            FileError::Adb(AdbError::Timeout)
        ));
        assert!(matches!(
            file_error_from_adb("/sdcard", AdbError::Io(std::io::Error::other("pipe"))),
            FileError::Adb(AdbError::Io(_))
        ));
        assert!(matches!(
            file_error_from_adb("/sdcard", AdbError::NotOnline("ABSENT".into())),
            FileError::Adb(AdbError::NotOnline(_))
        ));
        let not_online = file_error_from_adb("/sdcard", AdbError::NotOnline("ABSENT".into()));
        assert!(!not_online.to_string().contains("stderr"));
    }

    /// 模拟 browse / mutate / transfer 的 `map_err(file_error_from_adb)?`。
    /// 旧 `Err(adb)?` 因 `#[from]` 会把 BadExit 装进 `FileError::Adb`。
    fn after_adb_call(path: &str, err: AdbError) -> Result<(), FileError> {
        Err(file_error_from_adb(path, err))
    }

    #[test]
    fn question_mark_path_does_not_leak_bad_exit_into_adb() {
        let classified = after_adb_call(
            "/sdcard/a",
            AdbError::BadExit {
                exit_code: 1,
                stderr: "ls: /sdcard/a: No such file or directory".into(),
            },
        )
        .unwrap_err();
        assert!(matches!(classified, FileError::RemoteNotFound(_)));
        assert!(!matches!(classified, FileError::Adb(_)));

        let unknown = after_adb_call(
            "/sdcard/a",
            AdbError::BadExit {
                exit_code: 127,
                stderr: "toybox: classified-must-not-appear".into(),
            },
        )
        .unwrap_err();
        assert!(matches!(unknown, FileError::RemoteFailed(ref p) if p == "/sdcard/a"));
        assert!(!matches!(unknown, FileError::Adb(_)));
        assert!(!unknown.to_string().contains("classified-must-not-appear"));
        assert!(!unknown.to_string().contains("127"));

        let transport = after_adb_call("/sdcard/a", AdbError::Timeout).unwrap_err();
        assert!(matches!(transport, FileError::Adb(AdbError::Timeout)));
    }

    #[test]
    fn display_is_class_and_path() {
        assert_eq!(FileError::NotAttached.to_string(), "浏览会话未打开");
        assert_eq!(
            FileError::OutsideRoot("/data/x".into()).to_string(),
            yohu_domain::outside_root_text("/data/x")
        );
        assert_eq!(
            FileError::InvalidName(yohu_domain::ENTRY_NAME_EMPTY.into()).to_string(),
            yohu_domain::invalid_name_text(yohu_domain::ENTRY_NAME_EMPTY)
        );
        assert_eq!(
            FileError::NotAbsolute("sdcard/a".into()).to_string(),
            yohu_domain::not_absolute_text("sdcard/a")
        );
        assert_eq!(
            FileError::Traversal("/sdcard/../etc".into()).to_string(),
            yohu_domain::traversal_text("/sdcard/../etc")
        );
        assert_eq!(
            FileError::NotADirectory("/sdcard/a.txt".into()).to_string(),
            not_a_directory_text("/sdcard/a.txt")
        );
        assert_eq!(
            FileError::Local("/tmp/partial.bin".into()).to_string(),
            local_failed_text("/tmp/partial.bin")
        );
        assert_eq!(FileError::ProgressClosed.to_string(), "传输进度通道已关闭");
        assert_eq!(FileError::ProgressJoin.to_string(), PROGRESS_JOIN);
        assert!(!matches!(FileError::ProgressJoin, FileError::Adb(_)));
        let join_text = FileError::ProgressJoin.to_string();
        assert!(!join_text.to_ascii_lowercase().contains("panic"));
        assert!(!join_text.contains("JoinError"));
        assert!(!join_text.contains("io"));
        assert_eq!(
            FileError::EmptyTree("/sdcard/DCIM".into()).to_string(),
            "没有可拖出的项目: /sdcard/DCIM"
        );
        assert_eq!(
            FileError::TreeLimit(4096).to_string(),
            "拖出目录超过 4096 项"
        );
        assert_eq!(FileError::TreeDepth(24).to_string(), "拖出目录超过 24 层");
        assert!(!FileError::TreeDepth(24).to_string().contains("项"));
        assert!(!FileError::TreeLimit(4096).to_string().contains("层"));
        assert_eq!(
            FileError::Adb(AdbError::Cancelled).to_string(),
            AdbError::Cancelled.to_string()
        );
        assert!(!FileError::Path("/sdcard/a".into())
            .to_string()
            .contains("没有可拖出"));
        assert!(!FileError::Path("/sdcard/a".into())
            .to_string()
            .contains("超过"));
        assert_eq!(illegal_path_text("/sdcard/a"), "路径非法: /sdcard/a");
        assert_eq!(
            FileError::Path("/sdcard/a".into()).to_string(),
            illegal_path_text("/sdcard/a")
        );
        assert_eq!(remote_not_found_text("/p"), "远端不存在: /p");
        assert_eq!(not_a_directory_text("/p"), "不是目录: /p");
        assert_eq!(permission_denied_text("/p"), "没有权限: /p");
        assert_eq!(read_only_text("/p"), "文件系统只读: /p");
        assert_eq!(already_exists_text("/p"), "路径已存在: /p");
        assert_eq!(remote_failed_text("/p"), "远端操作失败: /p");
        assert_eq!(local_not_found_text("/p"), "本地路径不存在: /p");
        assert_eq!(local_failed_text("/p"), "本地操作失败: /p");
        assert_eq!(readlink_unparseable_text("/p"), "无法识别路径解析结果: /p");
        assert_eq!(PROGRESS_JOIN, "传输进度任务已中断");
    }

    #[test]
    fn cancelled_token_is_adb_cancelled() {
        use tokio_util::sync::CancellationToken;
        let token = CancellationToken::new();
        assert!(reject_if_cancelled(&token).is_ok());
        token.cancel();
        assert!(matches!(
            reject_if_cancelled(&token),
            Err(FileError::Adb(AdbError::Cancelled))
        ));
    }

    fn without_fn(src: &str, name: &str) -> String {
        let marker = format!("fn {name}");
        let mut out = String::new();
        let mut dropping = false;
        let mut depth = 0i32;
        let mut seen_brace = false;
        for line in src.lines() {
            if !dropping && line.contains(&marker) {
                dropping = true;
                depth = 0;
                seen_brace = false;
            }
            if dropping {
                depth += line.matches('{').count() as i32;
                depth -= line.matches('}').count() as i32;
                if line.contains('{') {
                    seen_brace = true;
                }
                if seen_brace && depth <= 0 {
                    dropping = false;
                }
                continue;
            }
            out.push_str(line);
            out.push('\n');
        }
        out
    }

    #[test]
    fn cut_file_judgments_stay_with_owner() {
        let mutate = without_fn(include_str!("mutate.rs"), "finish_shell");
        assert!(!mutate.contains("exit_code != 0"));

        let mut transfer = include_str!("transfer.rs").to_string();
        for name in ["known_total", "clamp_observed", "regular_file_len"] {
            transfer = without_fn(&transfer, name);
        }
        assert!(!transfer.contains("*n > 0"));
        assert!(!transfer.contains("local_total > 0"));
        assert!(!transfer.contains(".min(total)"));
        assert!(!transfer.contains("is_file()"));

        let mut tree = include_str!("tree.rs").to_string();
        for name in [
            "claim_remote",
            "require_entry_name",
            "listed_size",
            "ensure_drag_entries",
        ] {
            tree = without_fn(&tree, name);
        }
        assert!(!tree.contains("seen.insert"));
        assert!(!tree.contains("name.is_empty()"));
        assert!(!tree.contains("out.is_empty()"));
        assert!(!tree.contains("(true, 0)"));

        let guard = without_fn(include_str!("guard.rs"), "canonical_base");
        assert!(!guard.contains("resolved.is_empty()"));

        for src in [
            include_str!("browse.rs"),
            include_str!("guard.rs"),
            include_str!("tree.rs"),
        ] {
            assert!(!src.contains("is_cancelled()"));
        }
        let fault = without_fn(include_str!("fault.rs"), "reject_if_cancelled");
        let token_needle = ["cancel.", "is_cancelled", "()"].concat();
        assert!(!fault.contains(&token_needle));

        let browse = include_str!("browse.rs");
        assert!(!browse.contains("AdbError::Timeout"));
        assert!(!browse.contains("DeviceShellError::Cancelled) =>"));
    }
}

/// 若 `FileError: From<AdbError>` 再次成立（含 BadExit 自动 From），本模块无法通过类型推断。
/// `?` 对 `AdbError` 的自动转换依赖 `From`，因此同时锁住问号泄漏。
#[cfg(test)]
mod no_from_adb {
    use super::*;

    struct Guard<T>(core::marker::PhantomData<T>);
    trait AmbiguousIfFromAdb<A> {
        fn check() {}
    }
    impl<T: From<AdbError>> AmbiguousIfFromAdb<()> for Guard<T> {}
    impl<T> AmbiguousIfFromAdb<u8> for Guard<T> {}

    #[test]
    fn file_error_does_not_impl_from_adb_error() {
        <Guard<FileError> as AmbiguousIfFromAdb<_>>::check();
    }
}
