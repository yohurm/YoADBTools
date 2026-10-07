//! toybox / toolbox 命令 stderr 分类。`readlink` 与文件命令共用，禁止再抄一份针。

/// 设备命令 stderr 里能认出的文件系统事实。不是运输错误。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteStderr {
    NotFound,
    NotADirectory,
    PermissionDenied,
    ReadOnly,
    AlreadyExists,
}

pub fn classify(stderr: &str) -> Option<RemoteStderr> {
    let text = stderr.to_ascii_lowercase();
    if text.contains("no such file") || text.contains("does not exist") {
        return Some(RemoteStderr::NotFound);
    }
    if text.contains("not a directory") {
        return Some(RemoteStderr::NotADirectory);
    }
    if text.contains("permission denied") || text.contains("operation not permitted") {
        return Some(RemoteStderr::PermissionDenied);
    }
    if text.contains("read-only file system") {
        return Some(RemoteStderr::ReadOnly);
    }
    if text.contains("file exists") || text.contains("already exists") {
        return Some(RemoteStderr::AlreadyExists);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_toolbox_needles_once() {
        assert_eq!(
            classify("ls: /sdcard/a: No such file or directory"),
            Some(RemoteStderr::NotFound)
        );
        assert_eq!(
            classify("readlink: path does not exist"),
            Some(RemoteStderr::NotFound)
        );
        assert_eq!(
            classify("ls: /sdcard/a.txt: Not a directory"),
            Some(RemoteStderr::NotADirectory)
        );
        assert_eq!(
            classify("rm: /sdcard/x: Permission denied"),
            Some(RemoteStderr::PermissionDenied)
        );
        assert_eq!(
            classify("mkdir: Read-only file system"),
            Some(RemoteStderr::ReadOnly)
        );
        assert_eq!(
            classify("touch: file exists"),
            Some(RemoteStderr::AlreadyExists)
        );
        assert_eq!(classify("toybox: unknown"), None);
    }
}
