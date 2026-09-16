//! 设备侧命令失败分类。浏览 / 变更 / 传输共用。
//!
//! 错误只带分类与路径/计数/层数；禁止把 `ls`/`rm`/`readlink` stderr 原文交给 UI。

use thiserror::Error;
use yohu_adb::AdbError;

/// 文件服务错误。变体即分类；载荷是路径、计数、层数或运输层 `Adb`，禁止装用户句子。
#[derive(Debug, Error)]
pub enum FileError {
    #[error("路径非法: {0}")]
    Path(String),
    #[error("路径不在安全根内: {0}")]
    OutsideRoot(String),
    #[error("远端不存在: {0}")]
    RemoteNotFound(String),
    #[error("不是目录: {0}")]
    NotADirectory(String),
    #[error("没有权限: {0}")]
    PermissionDenied(String),
    #[error("文件系统只读: {0}")]
    ReadOnly(String),
    #[error("路径已存在: {0}")]
    AlreadyExists(String),
    #[error("远端操作失败: {0}")]
    RemoteFailed(String),
    #[error("本地路径不存在: {0}")]
    LocalNotFound(String),
    #[error("本地操作失败: {0}")]
    Local(String),
    #[error("传输进度通道已关闭")]
    ProgressClosed,
    #[error("传输进度任务已中断")]
    ProgressJoin,
    #[error("没有可拖出的项目: {0}")]
    EmptyTree(String),
    #[error("拖出目录超过 {0} 项")]
    TreeLimit(usize),
    #[error("拖出目录超过 {0} 层")]
    TreeDepth(u32),
    /// 仅手构运输失败（取消 / 掉线 / 超时 / IO）。`BadExit` 必须先走 `file_error_from_adb`。
    #[error("{0}")]
    Adb(AdbError),
}

/// 设备文件系统异常（与 ADB 掉线/取消等运输错误分开）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RemoteFault {
    NotFound,
    NotADirectory,
    PermissionDenied,
    ReadOnly,
    AlreadyExists,
}

/// 从 toybox / toolbox `ls`/`rm`/`mkdir`/`touch` stderr 识别异常。
pub(crate) fn classify_remote_stderr(stderr: &str) -> Option<RemoteFault> {
    let text = stderr.to_ascii_lowercase();
    if text.contains("no such file") || text.contains("does not exist") {
        return Some(RemoteFault::NotFound);
    }
    if text.contains("not a directory") {
        return Some(RemoteFault::NotADirectory);
    }
    if text.contains("permission denied") || text.contains("operation not permitted") {
        return Some(RemoteFault::PermissionDenied);
    }
    if text.contains("read-only file system") {
        return Some(RemoteFault::ReadOnly);
    }
    if text.contains("file exists") || text.contains("already exists") {
        return Some(RemoteFault::AlreadyExists);
    }
    None
}

/// 把 ADB 失败收成 `FileError`。未分类 BadExit 走 `RemoteFailed`，不带 stderr。
/// 运输变体手构 `Adb`；`BadExit` 不得装进 `Adb`。
pub(crate) fn file_error_from_adb(path: &str, err: AdbError) -> FileError {
    match err {
        AdbError::BadExit { stderr, .. } => match classify_remote_stderr(&stderr) {
            Some(RemoteFault::NotFound) => FileError::RemoteNotFound(path.to_string()),
            Some(RemoteFault::NotADirectory) => FileError::NotADirectory(path.to_string()),
            Some(RemoteFault::PermissionDenied) => FileError::PermissionDenied(path.to_string()),
            Some(RemoteFault::ReadOnly) => FileError::ReadOnly(path.to_string()),
            Some(RemoteFault::AlreadyExists) => FileError::AlreadyExists(path.to_string()),
            None => FileError::RemoteFailed(path.to_string()),
        },
        AdbError::Cancelled
        | AdbError::DeviceOffline(_)
        | AdbError::Timeout
        | AdbError::Io(_)
        | AdbError::ToolUnavailable(_) => FileError::Adb(err),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_ls_no_such_file() {
        let stderr = "ls: /sdcard/Android/data/com.ggec/: No such file or directory";
        assert_eq!(classify_remote_stderr(stderr), Some(RemoteFault::NotFound));
        let err = file_error_from_adb(
            "/sdcard/Android/data/com.ggec",
            AdbError::BadExit {
                exit_code: 1,
                stderr: stderr.into(),
            },
        );
        assert!(matches!(err, FileError::RemoteNotFound(_)));
        assert_eq!(err.to_string(), "远端不存在: /sdcard/Android/data/com.ggec");
        assert!(!err.to_string().contains("No such file"));
    }

    #[test]
    fn classifies_not_dir_permission_readonly_exists() {
        assert_eq!(
            classify_remote_stderr("ls: /sdcard/a.txt: Not a directory"),
            Some(RemoteFault::NotADirectory)
        );
        assert_eq!(
            classify_remote_stderr("rm: /sdcard/x: Permission denied"),
            Some(RemoteFault::PermissionDenied)
        );
        assert_eq!(
            classify_remote_stderr("mkdir: Read-only file system"),
            Some(RemoteFault::ReadOnly)
        );
        assert_eq!(
            classify_remote_stderr("touch: file exists"),
            Some(RemoteFault::AlreadyExists)
        );
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
        assert_eq!(err.to_string(), "远端操作失败: /sdcard");
        assert!(!err.to_string().contains("toybox"));
        assert!(!err.to_string().contains("127"));
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
        assert_eq!(
            FileError::OutsideRoot("/data/x".into()).to_string(),
            "路径不在安全根内: /data/x"
        );
        assert_eq!(
            FileError::NotADirectory("/sdcard/a.txt".into()).to_string(),
            "不是目录: /sdcard/a.txt"
        );
        assert_eq!(
            FileError::Local("/tmp/partial.bin".into()).to_string(),
            "本地操作失败: /tmp/partial.bin"
        );
        assert_eq!(FileError::ProgressClosed.to_string(), "传输进度通道已关闭");
        assert_eq!(FileError::ProgressJoin.to_string(), "传输进度任务已中断");
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
