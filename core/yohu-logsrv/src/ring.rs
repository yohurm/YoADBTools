//! 设备级共享环形缓冲（ADR-v6-006）。
//!
//! - `seq` 单调递增（设备内），是回补/溢出检测的锚点
//! - 设备切换/掉线 → `clear()`（防串设备）
//! - 导出/重放永远基于本缓冲快照（与推送通道状态无关 → 数据不丢）
//! - 过滤不在本环：导出在 `export` 调 domain `log_filter_matches`

use std::collections::VecDeque;
use std::sync::Mutex;

use yohu_protocol::LogLine;

struct State {
    buf: VecDeque<LogLine>,
    next_seq: u64,
    capacity: usize,
}

/// `-T` 续流时要跳过的已入环身份（同一墙钟可有多条）。
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ResumeSkip {
    pub ts: String,
    pub identities: Vec<(u32, u32, String, String)>,
}

/// 设备级共享环形缓冲。
pub(crate) struct RingBuffer {
    inner: Mutex<State>,
}

impl RingBuffer {
    pub(crate) fn new(capacity: usize) -> Self {
        let capacity = capacity.max(1);
        Self {
            inner: Mutex::new(State {
                buf: VecDeque::with_capacity(capacity.min(4096)),
                next_seq: 0,
                capacity,
            }),
        }
    }

    /// 下次写入起生效；已超出的旧记录立即从头部淘汰。
    pub(crate) fn set_capacity(&self, capacity: usize) {
        let capacity = capacity.max(1);
        let mut state = self.inner.lock().expect("ring lock poisoned");
        state.capacity = capacity;
        while state.buf.len() > state.capacity {
            state.buf.pop_front();
        }
    }

    /// 写入一条 logd 记录（分配 seq）；返回该记录 seq。
    pub(crate) fn push(&self, mut line: LogLine) -> u64 {
        let mut state = self.inner.lock().expect("ring lock poisoned");
        let seq = state.next_seq;
        line.seq = seq;
        state.buf.push_back(line);
        while state.buf.len() > state.capacity {
            state.buf.pop_front();
        }
        state.next_seq += 1;
        seq
    }

    /// 快照：`seq >= from_seq` 的前 `limit` 条记录（回补用）。
    pub(crate) fn snapshot(&self, from_seq: u64, limit: usize) -> Vec<LogLine> {
        let state = self.inner.lock().expect("ring lock poisoned");
        state
            .buf
            .iter()
            .filter(|l| l.seq >= from_seq)
            .take(limit)
            .cloned()
            .collect()
    }

    /// 从 `from_seq` 取至多 `limit` 条记录；`truncated` 表示环内还有更大 seq。
    pub(crate) fn snapshot_page(&self, from_seq: u64, limit: usize) -> (Vec<LogLine>, bool) {
        let state = self.inner.lock().expect("ring lock poisoned");
        let lines: Vec<LogLine> = state
            .buf
            .iter()
            .filter(|l| l.seq >= from_seq)
            .take(limit)
            .cloned()
            .collect();
        let ring_last = state.buf.back().map(|l| l.seq);
        let truncated = match (lines.last(), ring_last) {
            (Some(last), Some(newest)) => last.seq < newest,
            _ => false,
        };
        (lines, truncated)
    }

    /// 清空缓冲（用户清空 / 设备切换 / 掉线）。
    pub(crate) fn clear(&self) {
        let mut state = self.inner.lock().expect("ring lock poisoned");
        state.buf.clear();
        // seq 不回退：防止旧批次/旧回补被误判为新数据
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.inner.lock().expect("ring lock poisoned").buf.len()
    }

    #[cfg(test)]
    pub(crate) fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// 当前已分配的最大 seq（UI 判断滞后量的参考）。
    pub(crate) fn last_seq(&self) -> u64 {
        let state = self.inner.lock().expect("ring lock poisoned");
        state.next_seq.saturating_sub(1)
    }

    /// 工人重启用：末条墙钟 + 同一时刻已入环身份，避免 `-T` 含时刻重入。
    pub(crate) fn resume_skip(&self) -> Option<ResumeSkip> {
        let state = self.inner.lock().expect("ring lock poisoned");
        let last = state.buf.back()?;
        let ts = last.ts.clone();
        let identities = state
            .buf
            .iter()
            .filter(|l| l.ts == ts)
            .map(|l| (l.pid, l.tid, l.tag.clone(), l.msg.clone()))
            .collect();
        Some(ResumeSkip { ts, identities })
    }

    #[cfg(test)]
    pub(crate) fn capacity(&self) -> usize {
        self.inner.lock().expect("ring lock poisoned").capacity
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(seq_hint: u64) -> LogLine {
        LogLine {
            seq: seq_hint,
            ts: "2026-01-01 00:00:00.000".into(),
            pid: 1,
            tid: 1,
            level: 'I',
            tag: "T".into(),
            msg: format!("m{seq_hint}"),
            ..LogLine::default()
        }
    }

    #[test]
    fn assigns_monotonic_seq() {
        let ring = RingBuffer::new(10);
        assert_eq!(ring.push(line(999)), 0);
        assert_eq!(ring.push(line(999)), 1);
        assert_eq!(ring.last_seq(), 1);
    }

    #[test]
    fn evicts_oldest_beyond_capacity() {
        let ring = RingBuffer::new(3);
        for _ in 0..5 {
            ring.push(line(0));
        }
        assert_eq!(ring.len(), 3);
        let snap = ring.snapshot(0, 10);
        assert_eq!(snap[0].seq, 2);
        assert_eq!(snap[2].seq, 4);
    }

    #[test]
    fn snapshot_from_seq_and_page() {
        let ring = RingBuffer::new(10);
        for _ in 0..5 {
            ring.push(line(0));
        }
        let from_two = ring.snapshot(2, 10);
        assert_eq!(from_two.len(), 3);

        let (page, truncated) = ring.snapshot_page(0, 2);
        assert_eq!(page.len(), 2);
        assert!(truncated);
    }

    #[test]
    fn clear_keeps_seq_monotonic() {
        let ring = RingBuffer::new(10);
        ring.push(line(0));
        ring.clear();
        assert!(ring.is_empty());
        assert_eq!(ring.push(line(0)), 1);
    }

    #[test]
    fn set_capacity_trims_oldest() {
        let ring = RingBuffer::new(5);
        for _ in 0..5 {
            ring.push(line(0));
        }
        ring.set_capacity(2);
        assert_eq!(ring.capacity(), 2);
        assert_eq!(ring.len(), 2);
        let snap = ring.snapshot(0, 10);
        assert_eq!(snap[0].seq, 3);
        assert_eq!(snap[1].seq, 4);
    }

    #[test]
    fn resume_skip_is_last_ts_identities() {
        let ring = RingBuffer::new(10);
        ring.push(LogLine {
            ts: "2026-01-01 00:00:00.000".into(),
            pid: 1,
            tid: 1,
            tag: "A".into(),
            msg: "old".into(),
            ..LogLine::default()
        });
        ring.push(LogLine {
            ts: "2026-01-01 00:00:01.000".into(),
            pid: 2,
            tid: 2,
            tag: "B".into(),
            msg: "new".into(),
            ..LogLine::default()
        });
        let skip = ring.resume_skip().expect("has lines");
        assert_eq!(skip.ts, "2026-01-01 00:00:01.000");
        assert_eq!(skip.identities, vec![(2, 2, "B".into(), "new".into())]);
        ring.clear();
        assert!(ring.resume_skip().is_none());
    }
}
