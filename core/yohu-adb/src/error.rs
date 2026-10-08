//! ADB 层错误。

use yohu_runtime::ProcessError;

#[derive(Debug, thiserror::Error)]
pub enum AdbError {
    /// 候选目录都没有 adb。路径只留在解析日志，不进这句。
    /// 句子见 [`yohu_domain::TOOL_UNAVAILABLE`]。
    #[error("{}", yohu_domain::TOOL_UNAVAILABLE)]
    ToolUnavailable,
    /// 每个候选都没有给出退出码 0 的 `devices -l`。各候选明细在扫描日志。
    /// 句子见 [`yohu_domain::CANDIDATES_FAILED`]。
    #[error("{}", yohu_domain::CANDIDATES_FAILED)]
    CandidatesFailed,
    /// 运输层判定设备不在。载荷是调用方已有的 serial，不是 adb stderr。
    /// 句子见 [`yohu_domain::device_offline_text`]。
    #[error("{}", yohu_domain::device_offline_text(.0))]
    DeviceOffline(String),
    /// Hub 无 Online 槽：会话不变量，不是 adb stderr 运输掉线。
    /// 句子见 [`yohu_domain::device_not_online_text`]。
    #[error("{}", yohu_domain::device_not_online_text(.0))]
    NotOnline(String),
    /// 句子见 [`yohu_runtime::EXEC_TIMEOUT`]。
    #[error("{}", yohu_runtime::EXEC_TIMEOUT)]
    Timeout,
    /// 句子见 [`yohu_runtime::TASK_CANCELLED`]。执行端口映射后是另一句。
    #[error("{}", yohu_runtime::TASK_CANCELLED)]
    Cancelled,
    /// `adb shell -T` 不可用，调用方回退短命令。不是 IO 故障。
    /// 句子见 [`yohu_domain::UNSUPPORTED_SHELL`]。
    #[error("{}", yohu_domain::UNSUPPORTED_SHELL)]
    UnsupportedShell,
    /// 句子见 [`yohu_runtime::bad_exit_text`]。
    #[error("{}", yohu_runtime::bad_exit_text(*exit_code, stderr))]
    BadExit { exit_code: i32, stderr: String },
    /// 句子见 [`yohu_runtime::io_error_text`]。
    #[error("{}", yohu_runtime::io_error_text(&.0.to_string()))]
    Io(#[from] std::io::Error),
    /// 捕获预算用尽。句子来自 [`yohu_runtime::CAPTURE_TRUNCATED`]，不是 IO。
    #[error("{}", yohu_runtime::CAPTURE_TRUNCATED)]
    Truncated,
    /// 输出泵 panic。句子来自 [`yohu_runtime::PUMP_PANIC`]，不是 IO。
    #[error("{}", yohu_runtime::PUMP_PANIC)]
    PumpPanic,
    /// 长驻浏览 shell 的通道事实。不是 OS IO，也不是「无 -T」。
    #[error(transparent)]
    Shell(#[from] ShellFault),
}

/// 浏览 shell 通道失败。句子见领域 `SHELL_*`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ShellFault {
    #[error("{}", yohu_domain::SHELL_NO_STDIN)]
    NoStdin,
    #[error("{}", yohu_domain::SHELL_NO_STDOUT)]
    NoStdout,
    #[error("{}", yohu_domain::SHELL_HANDSHAKE)]
    Handshake,
    #[error("{}", yohu_domain::SHELL_ENDED)]
    Ended,
    #[error("{}", yohu_domain::SHELL_EXEC)]
    Exec,
}

impl From<ProcessError> for AdbError {
    fn from(e: ProcessError) -> Self {
        match e {
            ProcessError::Timeout => AdbError::Timeout,
            ProcessError::Cancelled => AdbError::Cancelled,
            ProcessError::Io(err) => AdbError::Io(err),
            ProcessError::BadExit { exit_code, stderr } => AdbError::BadExit { exit_code, stderr },
            ProcessError::Truncated => AdbError::Truncated,
            ProcessError::PumpPanic => AdbError::PumpPanic,
        }
    }
}

/// 映射到 domain 执行端口。只搬字段，不把本层 Display 再包一层。
impl From<AdbError> for yohu_domain::RunError {
    fn from(e: AdbError) -> Self {
        match e {
            AdbError::DeviceOffline(s) => yohu_domain::RunError::DeviceOffline(s),
            AdbError::NotOnline(s) => yohu_domain::RunError::NotOnline(s),
            AdbError::Timeout => yohu_domain::RunError::Timeout,
            AdbError::Cancelled => yohu_domain::RunError::Cancelled,
            AdbError::ToolUnavailable => yohu_domain::RunError::ToolUnavailable,
            AdbError::CandidatesFailed => yohu_domain::RunError::CandidatesFailed,
            AdbError::UnsupportedShell => yohu_domain::RunError::UnsupportedShell,
            AdbError::BadExit { exit_code, stderr } => {
                yohu_domain::RunError::BadExit { exit_code, stderr }
            }
            AdbError::Io(err) => yohu_domain::RunError::Io(err.to_string()),
            AdbError::Truncated => yohu_domain::RunError::Truncated,
            AdbError::PumpPanic => yohu_domain::RunError::PumpPanic,
            AdbError::Shell(fault) => yohu_domain::RunError::Shell(match fault {
                ShellFault::NoStdin => yohu_domain::RunShell::NoStdin,
                ShellFault::NoStdout => yohu_domain::RunShell::NoStdout,
                ShellFault::Handshake => yohu_domain::RunShell::Handshake,
                ShellFault::Ended => yohu_domain::RunShell::Ended,
                ShellFault::Exec => yohu_domain::RunShell::Exec,
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn port_error_keeps_each_transport_fact() {
        let offline = yohu_domain::RunError::from(AdbError::NotOnline("S1".into()));
        assert_eq!(offline, yohu_domain::RunError::NotOnline("S1".into()));
        assert_eq!(
            offline.to_string(),
            yohu_domain::device_not_online_text("S1")
        );

        let tool = yohu_domain::RunError::from(AdbError::ToolUnavailable);
        assert_eq!(tool, yohu_domain::RunError::ToolUnavailable);
        assert_eq!(tool.to_string(), yohu_domain::TOOL_UNAVAILABLE);
        assert!(!tool.to_string().contains("资源目录"));

        let scan = yohu_domain::RunError::from(AdbError::CandidatesFailed);
        assert_eq!(scan, yohu_domain::RunError::CandidatesFailed);
        assert_eq!(scan.to_string(), yohu_domain::CANDIDATES_FAILED);
        assert!(!scan.to_string().contains('；'));

        let exit = yohu_domain::RunError::from(AdbError::BadExit {
            exit_code: 1,
            stderr: "boom".into(),
        });
        assert_eq!(exit.to_string(), yohu_runtime::bad_exit_text(1, "boom"));
        assert_eq!(AdbError::Timeout.to_string(), yohu_runtime::EXEC_TIMEOUT);
        assert_eq!(
            yohu_domain::RunError::Timeout.to_string(),
            yohu_runtime::EXEC_TIMEOUT
        );
        assert_eq!(
            AdbError::Cancelled.to_string(),
            yohu_runtime::TASK_CANCELLED
        );
        assert_eq!(yohu_domain::RunError::Cancelled.to_string(), "已取消");
        let io = yohu_domain::RunError::Io("disk".into());
        assert_eq!(io.to_string(), yohu_runtime::io_error_text("disk"));
        let adb_io = AdbError::Io(std::io::Error::other("disk"));
        assert_eq!(adb_io.to_string(), yohu_runtime::io_error_text("disk"));
    }

    #[test]
    fn truncated_is_not_an_io_error() {
        let adb = AdbError::from(ProcessError::Truncated);
        assert!(matches!(&adb, AdbError::Truncated));
        assert_eq!(adb.to_string(), ProcessError::Truncated.to_string());
        let port = yohu_domain::RunError::from(adb);
        assert_eq!(port, yohu_domain::RunError::Truncated);
        assert_eq!(port.to_string(), yohu_runtime::CAPTURE_TRUNCATED);
    }

    #[test]
    fn pump_panic_is_not_an_io_error() {
        let adb = AdbError::from(ProcessError::PumpPanic);
        assert!(matches!(&adb, AdbError::PumpPanic));
        assert_eq!(adb.to_string(), yohu_runtime::PUMP_PANIC);
        let port = yohu_domain::RunError::from(adb);
        assert_eq!(port, yohu_domain::RunError::PumpPanic);
        assert_eq!(port.to_string(), yohu_runtime::PUMP_PANIC);
    }

    #[test]
    fn cut_transport_judgments_stay_with_owner() {
        let client = include_str!("client.rs");
        let shell = include_str!("device_shell.rs");
        assert!(
            !client.contains("DeviceOffline(serial.to_string())"),
            "掉线运输错误只在 parse/offline.rs 组装"
        );
        assert!(!shell.contains("DeviceOffline(serial.to_string())"));
        assert!(
            !client.contains("return Err(AdbError::BadExit"),
            "短命令非零退出与空 stdout 采样失败不再各自拼 BadExit"
        );
        assert_eq!(
            client
                .matches("out.exit_code != 0 && out.stdout.trim().is_empty()")
                .count(),
            1,
            "空 stdout 采样失败只判一次"
        );
        assert_eq!(
            client.matches("fn require_zero_exit").count(),
            1,
            "短命令非零退出只在 require_zero_exit"
        );
    }

    #[test]
    fn shell_fault_is_not_an_io_error() {
        for fault in [
            ShellFault::NoStdin,
            ShellFault::NoStdout,
            ShellFault::Handshake,
            ShellFault::Ended,
            ShellFault::Exec,
        ] {
            let adb = AdbError::Shell(fault);
            let text = adb.to_string();
            assert!(!text.starts_with("IO 错误"));
            let port = yohu_domain::RunError::from(adb);
            assert_eq!(port.to_string(), text);
        }
    }

    #[test]
    fn tool_lock_sentence_once() {
        let src = include_str!("tool.rs");
        let stripped = src.replacen("    result.expect(\"tool lock poisoned\")", "", 1);
        assert!(!stripped.contains("tool lock poisoned"));
    }
}
