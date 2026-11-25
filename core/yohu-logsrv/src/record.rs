//! 采集入口记录模型：解析/组装产出的内部记录，不含 `seq`。
//!
//! 在写入环的边界一次性映射为 wire `LogLine`（`seq` 由环分配），
//! 避免生产端字段被下游静默覆盖。

use yohu_protocol::LogLine;

/// 入环前 `LogLine.seq` 的占位值：环在 `push` 里立刻用分配的序号覆盖它。
///
/// 这是**声明**而不是「写个 0 碰巧没人看」：`RingBuffer::push` 会断言传入的就是这个占位值，
/// 任何试图在入环前自带序号的路径都会在 debug 构建里立刻暴露。
pub(crate) const UNASSIGNED_SEQ: u64 = u64::MAX;

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LogRecord {
    pub ts: String,
    pub pid: u32,
    pub tid: u32,
    pub uid: Option<String>,
    pub level: char,
    pub tag: String,
    pub msg: String,
}

impl LogRecord {
    /// 边界转换：把入口记录转成 wire 行，`seq` 留给环分配（占位 [`UNASSIGNED_SEQ`]）。
    pub(crate) fn into_wire(self) -> LogLine {
        LogLine {
            seq: UNASSIGNED_SEQ,
            ts: self.ts,
            pid: self.pid,
            tid: self.tid,
            uid: self.uid,
            level: self.level,
            tag: self.tag,
            msg: self.msg,
        }
    }
}

impl Default for LogRecord {
    fn default() -> Self {
        Self {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn into_wire_marks_seq_as_unassigned() {
        let wire = LogRecord {
            ts: "2026-01-01 00:00:00.000".into(),
            pid: 7,
            tid: 8,
            tag: "T".into(),
            msg: "hello".into(),
            ..LogRecord::default()
        }
        .into_wire();
        assert_eq!(wire.seq, UNASSIGNED_SEQ);
        assert_eq!(wire.pid, 7);
        assert_eq!(wire.tid, 8);
        assert_eq!(wire.msg, "hello");
    }
}
