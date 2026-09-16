//! 文件传输与设备文件条目。

use serde::{Deserialize, Serialize};

/// 传输方向。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    /// 本机 → 设备
    Push,
    /// 设备 → 本机
    Pull,
}

/// 传输状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferState {
    Running,
    Done,
    Failed,
    Cancelled,
}

/// 传输失败分类。只带 kind + 路径/serial；禁止用户句子、stderr、JoinError 文本。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TransferFault {
    Path { path: String },
    OutsideRoot { path: String },
    RemoteNotFound { path: String },
    NotADirectory { path: String },
    PermissionDenied { path: String },
    ReadOnly { path: String },
    AlreadyExists { path: String },
    RemoteFailed { path: String },
    LocalNotFound { path: String },
    Local { path: String },
    DeviceOffline { serial: String },
    Timeout,
    Io,
    ToolUnavailable,
    ProgressJoin,
}

/// 传输进度（状态迁移即发；200ms 节流预留）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TransferProgress {
    pub id: u32,
    pub direction: Direction,
    pub bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    pub state: TransferState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fault: Option<TransferFault>,
    /// 展示名（远端末段）。壳发号后第一帧就带，UI 禁止事后补名。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// 设备文件条目类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Dir,
    File,
    Symlink,
    Other,
}

/// `ls -lla` 解析出的条目。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RemoteEntry {
    pub name: String,
    pub kind: EntryKind,
    pub size: u64,
    /// 权限位原文（如 `drwxr-xr-x`）
    pub permission: String,
    /// 符号链接目标（kind = symlink 时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_target: Option<String>,
    /// 修改时间（`YYYY-MM-DD HH:mm:ss`；来自 `ls -lla` 后再规范化，不到毫秒）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtime: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transfer_progress_omits_optional_fault_and_has_no_message() {
        let progress = TransferProgress {
            id: 1,
            direction: Direction::Push,
            bytes: 0,
            total: None,
            state: TransferState::Running,
            fault: None,
            name: None,
        };
        let v = serde_json::to_value(&progress).unwrap();
        assert_eq!(v["id"], 1);
        assert_eq!(v["direction"], "push");
        assert_eq!(v["bytes"], 0);
        assert_eq!(v["state"], "running");
        assert!(v.get("fault").is_none());
        assert!(v.get("message").is_none());
        assert!(v.get("name").is_none());
        assert!(v.get("total").is_none());
    }

    #[test]
    fn transfer_fault_is_internally_tagged() {
        let path = TransferFault::RemoteNotFound {
            path: "/sdcard/a".into(),
        };
        assert_eq!(
            serde_json::to_value(&path).unwrap(),
            serde_json::json!({ "kind": "remote_not_found", "path": "/sdcard/a" })
        );
        let offline = TransferFault::DeviceOffline {
            serial: "S1".into(),
        };
        assert_eq!(
            serde_json::to_value(&offline).unwrap(),
            serde_json::json!({ "kind": "device_offline", "serial": "S1" })
        );
        assert_eq!(
            serde_json::to_value(&TransferFault::ProgressJoin).unwrap(),
            serde_json::json!({ "kind": "progress_join" })
        );
        assert_eq!(
            serde_json::to_value(&TransferFault::Timeout).unwrap(),
            serde_json::json!({ "kind": "timeout" })
        );
    }
}
