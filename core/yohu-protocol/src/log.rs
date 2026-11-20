//! 日志域 wire 类型：logd 记录、批量协议、过滤作用域、进程索引。

use serde::{Deserialize, Serialize};

/// 一条已解析的 logd 记录（对照 AS `LogcatMessage`）。
///
/// `seq` 由 core 的共享环形缓冲单调分配（设备内递增），
/// 是溢出检测（`log.overflow`）与页投影的锚点。
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
    /// 级别字母：`V/D/I/W/E/F`（Assert 归一为 `F`）；解析失败或未知优先级为 `'?'`。
    /// 合法集合的唯一来源是 `yohu_domain::LOG_LEVEL_LETTERS`。
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
            level: '?',
            tag: String::new(),
            msg: String::new(),
        }
    }
}

/// 窗口过滤登记。命中索引在环旁边重建，返回当前全部可见命中。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LogWindowBind {
    pub id: u64,
    pub serial: String,
    pub filter: LogFilter,
    pub from_seq: u64,
}

/// 一次窗口快照：登记/跟尾时一次装入当前全部可见命中。
///
/// 信号计数不在 wire 上：界面按可见行派生（`signalCountOf`），core 不再维护第二份。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LogPage {
    pub window_id: u64,
    pub serial: String,
    pub total: u64,
    pub lines: Vec<LogLine>,
}

/// 一批窗口命中。`tail` 是这批新增命中的正文。界面跟尾时钉底，离开底部仍写入文档但不移动视口。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LogHits {
    pub serial: String,
    pub window_id: u64,
    pub total: u64,
    pub appended: u32,
    pub tail: Vec<LogLine>,
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
/// `generation` 是该 serial 的槽位世代：Empty 时为最后一次世代，从未采过为 0。
/// 世代由全局发号器分配，**只在同一 serial 内可比**（不可跨设备比较先后）。
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
///
/// `generation` **必填**（无 serde 缺省）：迟到的旧世代快照不得写进新世代，
/// 与 [`crate::AppEvent::CaptureState`] 同一条「只升不减」规则。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProcessIndexSnapshot {
    pub serial: String,
    pub generation: u64,
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

    /// 进程索引快照必须携带世代：缺字段反序列化失败（不得回落成「当前世代」）。
    #[test]
    fn process_index_snapshot_requires_generation() {
        let missing = serde_json::from_str::<ProcessIndexSnapshot>(
            r#"{"serial":"S","entries":[],"degraded":false}"#,
        );
        assert!(missing.is_err(), "缺 generation 的快照必须被拒绝");

        let ok: ProcessIndexSnapshot = serde_json::from_str(
            r#"{"serial":"S","generation":7,"entries":[{"pid":1,"name":"a"}],"degraded":false}"#,
        )
        .expect("带世代应可解析");
        assert_eq!(ok.generation, 7);

        let v = serde_json::to_value(&ok).expect("serialize");
        assert_eq!(v["generation"], 7, "世代必须出现在 wire 上");
    }

    /// 信号计数不在 wire 上：core 不再维护第二份（界面从可见行派生）。
    #[test]
    fn log_page_and_hits_carry_no_signal_count() {
        let page = LogPage {
            window_id: 1,
            serial: "S".into(),
            total: 2,
            lines: Vec::new(),
        };
        let hits = LogHits {
            serial: "S".into(),
            window_id: 1,
            total: 2,
            appended: 1,
            tail: Vec::new(),
        };
        for value in [
            serde_json::to_value(&page).unwrap(),
            serde_json::to_value(&hits).unwrap(),
        ] {
            assert!(
                value.get("signals").is_none(),
                "signals 不得回到 wire（唯一源是界面可见行）"
            );
        }
    }
}
