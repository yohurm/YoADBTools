//! invoke 命令的请求/响应 DTO。

use serde::{Deserialize, Serialize};

use crate::LogFilter;

/// `adb.exec` 请求。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdbExecRequest {
    /// 空串 = 不指定设备（仅 `devices` 等全局命令）
    pub serial: String,
    pub argv: Vec<String>,
    /// 超时（毫秒）；None = 不设超时
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
}

/// `log.replay` 请求：从环按 seq 回补，不过滤（窗口过滤在 UI 消费端）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReplayRequest {
    pub serial: String,
    pub from_seq: u64,
    pub limit: u32,
}

/// `log.export` 请求：当前窗口过滤条件下的环快照，写一份 txt。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportRequest {
    pub serial: String,
    /// 本窗口起始序号（从未开始采集的窗口不得导出）
    pub from_seq: u64,
    pub filter: LogFilter,
    /// 目标文件；空 = 按设置目录生成带时间戳的文件名
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExportResult {
    pub path: String,
    pub lines: u64,
}

/// 设备路径操作（删除/新建目录）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PathOpRequest {
    pub serial: String,
    pub path: String,
}

/// `files.push/pull` 请求。方向由命令名决定；id 由壳发号，不进 DTO。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TransferRequest {
    pub serial: String,
    pub local: String,
    pub remote: String,
    /// 已知总量（单文件 pull 用清单 size）。缺省由 runner 自己量本地 push。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_bytes: Option<u64>,
}

/// `files.dragOut`：把设备路径交给壳虚拟文件拖出（DoDragDrop 结束后返回）。
/// `generation` 必填，无 serde 缺省；缺字段反序列化失败（禁止回落到槽位窥世代）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DragOutRequest {
    pub serial: String,
    pub remotes: Vec<String>,
    pub generation: u64,
}

/// `group.run` 请求。组内条目从命令库读取；组执行不接受运行时占位符。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GroupRunRequest {
    pub group_id: String,
    pub serials: Vec<String>,
}

/// `block.run` 请求。步骤与间隔从命令库读取；占位符由 domain 填充。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BlockRunRequest {
    pub block_id: String,
    #[serde(default)]
    pub values: Vec<String>,
    pub serials: Vec<String>,
}

/// `terminal.eval` 请求：按库 id 查找、领域填充占位符、多设备并行执行。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TerminalEvalRequest {
    pub command_id: String,
    #[serde(default)]
    pub values: Vec<String>,
    pub serials: Vec<String>,
}

/// `terminal.exec` 请求：自定义命令行，多设备并行执行（不查命令库）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TerminalExecRequest {
    pub command: String,
    pub serials: Vec<String>,
}

/// 单台设备的 `terminal.eval` 结果。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SerialEvalResult {
    pub serial: String,
    pub ok: bool,
    pub message: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
}

/// `terminal.eval` / `terminal.exec` 单台原始输出（`ok` 仅反映退出码，UI 不展示成败）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvalResult {
    pub ok: bool,
    pub message: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    /// 执行用时（毫秒）
    pub duration_ms: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transfer_request_has_no_id_or_direction() {
        let parsed: TransferRequest =
            serde_json::from_str(r#"{"serial":"S","local":"C:/a.bin","remote":"/sdcard/a.bin"}"#)
                .unwrap();
        assert_eq!(parsed.serial, "S");
        assert_eq!(parsed.remote, "/sdcard/a.bin");
        assert_eq!(parsed.expected_bytes, None);
        let sized: TransferRequest = serde_json::from_str(
            r#"{"serial":"S","local":"C:/a.bin","remote":"/sdcard/a.bin","expected_bytes":12}"#,
        )
        .unwrap();
        assert_eq!(sized.expected_bytes, Some(12));
    }

    #[test]
    fn eval_result_snake_case() {
        let v = serde_json::to_value(EvalResult {
            ok: false,
            message: "退出码 1".into(),
            exit_code: 1,
            stdout: "out".into(),
            stderr: "err".into(),
            duration_ms: 12,
        })
        .unwrap();
        assert_eq!(v["exit_code"], 1);
        assert_eq!(v["duration_ms"], 12);
        assert_eq!(v["ok"], false);
    }

    #[test]
    fn drag_out_request_is_serial_plus_remotes() {
        let parsed: DragOutRequest = serde_json::from_str(
            r#"{"serial":"S","remotes":["/sdcard/a.txt","/sdcard/DCIM"],"generation":7}"#,
        )
        .unwrap();
        assert_eq!(parsed.serial, "S");
        assert_eq!(parsed.remotes.len(), 2);
        assert_eq!(parsed.generation, 7);
        assert!(serde_json::from_str::<DragOutRequest>(
            r#"{"serial":"S","remotes":["/sdcard/a.txt"]}"#
        )
        .is_err());
    }

    #[test]
    fn terminal_eval_request_is_id_values_serials() {
        let parsed: TerminalEvalRequest = serde_json::from_str(
            r#"{"command_id":"c1","values":["8.8.8.8"],"serials":["S1","S2"]}"#,
        )
        .unwrap();
        assert_eq!(parsed.command_id, "c1");
        assert_eq!(parsed.values, vec!["8.8.8.8"]);
        assert_eq!(parsed.serials.len(), 2);
    }

    #[test]
    fn terminal_exec_request_is_command_serials() {
        let parsed: TerminalExecRequest =
            serde_json::from_str(r#"{"command":"shell ls","serials":["S1"]}"#).unwrap();
        assert_eq!(parsed.command, "shell ls");
        assert_eq!(parsed.serials, vec!["S1"]);
    }
}
