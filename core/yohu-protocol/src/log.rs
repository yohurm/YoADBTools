//! 日志域 wire 类型：logcat 行、批量协议、过滤作用域、进程索引。

use serde::{Deserialize, Serialize};

/// 一条已解析的 logd 记录（对照 AS `LogcatMessage`）。
///
/// `seq` 由 core 的共享环形缓冲单调分配（设备内递增），
/// 是 UI 回补（`log.replay`）与溢出检测（`log.overflow`）的锚点。
/// `msg` 可含硬 `\n`（一条记录的多行正文），不是 adb 物理行。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LogLine {
    pub seq: u64,
    /// 墙钟文本（`YYYY-MM-DD HH:mm:ss.SSS`；采集自 `logcat -v long,uid,year`）
    pub ts: String,
    pub pid: u32,
    pub tid: u32,
    /// AOSP `FORMAT_LONG`+`uid` 的 UID（`%5s:` / `%5d:`）：数字或短名；未开 uid 为 None
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uid: Option<String>,
    /// 应用/进程名（对照 `LogcatHeader.applicationId`）。long 头不打印此列；采集为 None，清单 Formatter 用进程索引填 AppName
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app: Option<String>,
    /// 级别字母：V/D/I/W/E/F；解析失败时为 '?'
    pub level: char,
    pub tag: String,
    pub msg: String,
}

impl Default for LogLine {
    fn default() -> Self {
        Self {
            seq: 0,
            ts: String::new(),
            pid: 0,
            tid: 0,
            uid: None,
            app: None,
            level: '?',
            tag: String::new(),
            msg: String::new(),
        }
    }
}

/// 一个批量推送（ADR-v6-007：100–200ms 聚合，禁逐行）。
///
/// `from_seq` = 本批首行的 seq；`truncated` 表示本批之后环内仍有更新行。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LogBatch {
    pub serial: String,
    pub from_seq: u64,
    pub lines: Vec<LogLine>,
    pub truncated: bool,
}

/// 采集状态（wire 上必须带 `generation`，见 [`crate::AppEvent::CaptureState`]）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureState {
    Running,
    Stopped,
}

/// `log.capture.start` 返回：新流或 adopt 已有 Live 流。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CaptureStart {
    pub serial: String,
    pub generation: u64,
    pub adopted: bool,
}

/// `log.capture.status`：UI 对账用。`capturing` = Starting | Live（Stopping 视为未采集）。
/// Empty 时 `generation` 为该 serial **最后一次槽位世代**（从未采过为 0），不是永远 0。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CaptureStatus {
    pub serial: String,
    pub capturing: bool,
    pub generation: u64,
    pub last_seq: u64,
}

/// 进程索引条目（`ps -A -o PID,NAME`）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProcessEntry {
    pub pid: u32,
    /// 进程名（≈包名）
    pub name: String,
}

/// 进程索引快照。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProcessIndexSnapshot {
    pub serial: String,
    pub entries: Vec<ProcessEntry>,
    /// 本次刷新失败（降级为「仅 PID 模式」）
    pub degraded: bool,
}

/// 过滤作用域：空 `package.pids` = 无命中（与 UI 包名会话一致）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LogScope {
    #[default]
    All,
    Pid {
        pid: u32,
    },
    Package {
        pids: Vec<u32>,
    },
}

/// 日志过滤条件（会话过滤 / 导出共用；回补读环不过滤）。
///
/// `levels` 空 = 不限级别（含解析失败的 `?`）；非空 = 精确字母集合，不是最低含以上。
/// `tag_contains`：逗号 / 分号 / `|` 分隔多个针，任一 OrdinalIgnoreCase 精确命中；空或仅分隔符 = 不限。无正则。子串会误伤 `libc`/`libcomposer`。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct LogFilter {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub levels: Vec<char>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag_contains: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_contains: Option<String>,
    #[serde(default)]
    pub scope: LogScope,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_scope_json_internally_tagged() {
        let v = serde_json::to_value(LogScope::Package { pids: vec![1] }).unwrap();
        assert_eq!(v["kind"], "package");
        assert_eq!(v["pids"][0], 1);
    }

    #[test]
    fn capture_start_status_snake_case() {
        let start = CaptureStart {
            serial: "s1".into(),
            generation: 2,
            adopted: true,
        };
        let v = serde_json::to_value(&start).unwrap();
        assert_eq!(v["serial"], "s1");
        assert_eq!(v["generation"], 2);
        assert_eq!(v["adopted"], true);

        let status = CaptureStatus {
            serial: "s1".into(),
            capturing: true,
            generation: 2,
            last_seq: 9,
        };
        let s = serde_json::to_value(&status).unwrap();
        assert_eq!(s["last_seq"], 9);
        assert_eq!(s["capturing"], true);
    }

    #[test]
    fn log_filter_levels_exact_set_omits_empty() {
        let filtered = LogFilter {
            levels: vec!['W', 'E'],
            ..Default::default()
        };
        let v = serde_json::to_value(&filtered).unwrap();
        assert_eq!(v["levels"], serde_json::json!(["W", "E"]));
        assert!(v.get("min_level").is_none());

        let empty = serde_json::to_value(LogFilter::default()).unwrap();
        assert!(empty.get("levels").is_none());
    }
}
