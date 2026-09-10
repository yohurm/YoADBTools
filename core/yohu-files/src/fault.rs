//! 设备侧命令失败分类。浏览 / 变更 / 传输共用，禁止把 `ls`/`rm` stderr 原文交给 UI。

use yohu_adb::AdbError;

use crate::FileError;

/// 设备文件系统异常（与 ADB 掉线/取消等运输错误分开）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteFault {
    NotFound,
    NotADirectory,
    PermissionDenied,
    ReadOnly,
    AlreadyExists,
}

/// 从 toybox / toolbox `ls`/`rm`/`mkdir`/`touch` stderr 识别异常。
pub fn classify_remote_stderr(stderr: &str) -> Option<RemoteFault> {
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

/// 把 ADB 失败收成 `FileError`。能分类的 BadExit 不再带着退出码原文往上走。
pub fn file_error_from_adb(path: &str, err: AdbError) -> FileError {
    match err {
        AdbError::BadExit { stderr, exit_code } => match classify_remote_stderr(&stderr) {
            Some(RemoteFault::NotFound) => FileError::RemoteNotFound(path.to_string()),
            Some(RemoteFault::NotADirectory) => FileError::NotADirectory(path.to_string()),
            Some(RemoteFault::PermissionDenied) => FileError::PermissionDenied(path.to_string()),
            Some(RemoteFault::ReadOnly) => FileError::ReadOnly(path.to_string()),
            Some(RemoteFault::AlreadyExists) => FileError::AlreadyExists(path.to_string()),
            None => FileError::Adb(AdbError::BadExit { exit_code, stderr }),
        },
        other => FileError::Adb(other),
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
        assert_eq!(err.to_string(), "没有这个目录，请重新输入");
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
    fn unknown_bad_exit_stays_adb() {
        let err = file_error_from_adb(
            "/sdcard",
            AdbError::BadExit {
                exit_code: 127,
                stderr: "toybox: unknown".into(),
            },
        );
        assert!(matches!(err, FileError::Adb(_)));
    }

    #[test]
    fn cancelled_stays_adb() {
        assert!(matches!(
            file_error_from_adb("/sdcard", AdbError::Cancelled),
            FileError::Adb(AdbError::Cancelled)
        ));
    }
}
