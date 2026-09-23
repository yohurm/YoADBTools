//! 投屏错误。

use yohu_adb::AdbError;

#[derive(Debug, thiserror::Error)]
pub enum MirrorError {
    #[error("投屏已取消")]
    Cancelled,
    #[error("缺少 scrcpy-server（请运行 scripts/setup-scrcpy-server.ps1）: {0}")]
    ServerMissing(String),
    #[error("投屏协议错误: {0}")]
    Protocol(String),
    #[error("投屏编码错误: {0}")]
    Codec(String),
    #[error("设备端 server 失败: {0}")]
    ServerFailed(String),
    #[error("当前会话为只读，无法注入控制")]
    NoControl,
    #[error("设备没有进行中的投屏")]
    NotLive,
    #[error("{0}")]
    Adb(#[from] AdbError),
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
}

impl MirrorError {
    /// 事件 / IPC 展示句。`BadExit` 不带 stderr（对齐 files `file_error_from_adb`）。
    pub fn public_message(&self) -> String {
        match self {
            Self::Adb(AdbError::BadExit { exit_code, .. }) => {
                format!("投屏设备命令失败(退出码 {exit_code})")
            }
            Self::Adb(AdbError::Io(_)) | Self::Adb(AdbError::UnsupportedShell) => {
                "投屏设备通道失败".to_string()
            }
            other => other.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_message_strips_bad_exit_stderr() {
        let err = MirrorError::Adb(AdbError::BadExit {
            exit_code: 1,
            stderr: "ls: /secret: Permission denied".into(),
        });
        let text = err.public_message();
        assert_eq!(text, "投屏设备命令失败(退出码 1)");
        assert!(!text.contains("Permission denied"));
        assert!(!text.contains("/secret"));
    }
}
