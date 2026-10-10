//! 设备级共享环形缓冲（ADR-v6-006）。
//!
//! - `seq` 单调递增（设备内），是回补/溢出检测的锚点
//! - 设备切换/掉线 → `clear()`（防串设备）
//! - 导出/重放永远基于本缓冲快照（与推送通道状态无关 → 数据不丢）
//! - 过滤不在本环：导出在 `export` 调 domain `log_filter_matches`

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, MutexGuard};

use yohu_protocol::LogLine;

/// 环内一行。Tag / App 驻留，消息正文只存一份。
struct StoredLine {
    seq: u64,
    ts: String,
    pid: u32,
    tid: u32,
    uid: Option<String>,
    app: Option<Arc<str>>,
    level: char,
    tag: Arc<str>,
    msg: String,
}

struct State {
    buf: VecDeque<StoredLine>,
    next_seq: u64,
    capacity: usize,
    tags: HashMap<String, Arc<str>>,
    apps: HashMap<String, Arc<str>>,
}

/// 写入结果。`oldest` 是淘汰后仍在环内的最小 seq。
pub(crate) struct Pushed {
    pub seq: u64,
    pub oldest: u64,
}

/// 环容量至少为 1。采集服务存的也是这一把。
pub(crate) fn ring_capacity(capacity: usize) -> usize {
    capacity.max(1)
}

impl State {
    fn evict_overflow(&mut self) {
        while self.buf.len() > self.capacity {
            self.buf.pop_front();
        }
    }

    fn intern(pool: &mut HashMap<String, Arc<str>>, value: String) -> Arc<str> {
        if let Some(existing) = pool.get(&value) {
            return Arc::clone(existing);
        }
        let arc: Arc<str> = Arc::from(value.as_str());
        pool.insert(value, Arc::clone(&arc));
        arc
    }

    fn to_wire(line: &StoredLine) -> LogLine {
        LogLine {
            seq: line.seq,
            ts: line.ts.clone(),
            pid: line.pid,
            tid: line.tid,
            uid: line.uid.clone(),
            app: line.app.as_ref().map(|s| s.to_string()),
            level: line.level,
            tag: line.tag.to_string(),
            msg: line.msg.clone(),
        }
    }

    fn lines_from(&self, from_seq: u64, limit: usize) -> Vec<LogLine> {
        self.buf
            .iter()
            .filter(|line| from_seq <= line.seq)
            .take(limit)
            .map(Self::to_wire)
            .collect()
    }
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
    fn lock_state(&self) -> MutexGuard<'_, State> {
        self.inner.lock().expect("ring lock poisoned")
    }

    pub(crate) fn new(capacity: usize) -> Self {
        let capacity = ring_capacity(capacity);
        Self {
            inner: Mutex::new(State {
                buf: VecDeque::with_capacity(capacity),
                next_seq: 0,
                capacity,
                tags: HashMap::new(),
                apps: HashMap::new(),
            }),
        }
    }

    /// 下次写入起生效；已超出的旧记录立即从头部淘汰。
    pub(crate) fn set_capacity(&self, capacity: usize) {
        let capacity = ring_capacity(capacity);
        let mut state = self.lock_state();
        state.capacity = capacity;
        state.evict_overflow();
    }

    /// 写入一条 logd 记录（分配 seq）。所有权留在环内，Tag / App 驻留。
    pub(crate) fn push(&self, line: LogLine) -> Pushed {
        let mut state = self.lock_state();
        let seq = state.next_seq;
        let tag = State::intern(&mut state.tags, line.tag);
        let app = line.app.map(|value| State::intern(&mut state.apps, value));
        state.buf.push_back(StoredLine {
            seq,
            ts: line.ts,
            pid: line.pid,
            tid: line.tid,
            uid: line.uid,
            app,
            level: line.level,
            tag,
            msg: line.msg,
        });
        state.evict_overflow();
        state.next_seq += 1;
        let oldest = state.buf.front().map(|l| l.seq).unwrap_or(seq);
        Pushed { seq, oldest }
    }

    /// 按序号取正文。环内序号连续，下标是 `seq - 最旧序号`。
    pub(crate) fn lines_by_seq(&self, seqs: &[u64]) -> Vec<LogLine> {
        if seqs.is_empty() {
            return Vec::new();
        }
        let state = self.lock_state();
        let Some(oldest) = state.buf.front().map(|line| line.seq) else {
            return Vec::new();
        };
        let mut out = Vec::with_capacity(seqs.len());
        for seq in seqs {
            let Some(offset) = seq.checked_sub(oldest) else {
                continue;
            };
            let Some(line) = state.buf.get(offset as usize) else {
                continue;
            };
            if line.seq == *seq {
                out.push(State::to_wire(line));
            }
        }
        out
    }

    /// 从 `from_seq` 起遍历，供窗口登记重建索引。回调里的行是临时线拷贝。
    pub(crate) fn for_each_from(&self, from_seq: u64, mut visit: impl FnMut(&LogLine)) {
        let state = self.lock_state();
        for line in state.buf.iter().filter(|line| from_seq <= line.seq) {
            let wire = State::to_wire(line);
            visit(&wire);
        }
    }

    /// 同一 Tag 驻留为同一份 `Arc`。
    #[cfg(test)]
    pub(crate) fn tag_ptr_eq(&self, seq_a: u64, seq_b: u64) -> bool {
        let state = self.lock_state();
        let a = state.buf.iter().find(|l| l.seq == seq_a);
        let b = state.buf.iter().find(|l| l.seq == seq_b);
        match (a, b) {
            (Some(a), Some(b)) => Arc::ptr_eq(&a.tag, &b.tag),
            _ => false,
        }
    }

    /// 快照：从指定序号起的前 `limit` 条记录（回补用）。
    pub(crate) fn snapshot(&self, from_seq: u64, limit: usize) -> Vec<LogLine> {
        let state = self.lock_state();
        state.lines_from(from_seq, limit)
    }

    /// 从 `from_seq` 取至多 `limit` 条记录；`truncated` 表示环内还有更大 seq。
    pub(crate) fn snapshot_page(&self, from_seq: u64, limit: usize) -> (Vec<LogLine>, bool) {
        let state = self.lock_state();
        let lines = state.lines_from(from_seq, limit);
        let ring_last = state.buf.back().map(|l| l.seq);
        let truncated = match (lines.last(), ring_last) {
            (Some(last), Some(newest)) => last.seq < newest,
            _ => false,
        };
        (lines, truncated)
    }

    /// 清空缓冲（用户清空 / 设备切换 / 掉线）。
    pub(crate) fn clear(&self) {
        let mut state = self.lock_state();
        state.buf.clear();
        // seq 不回退：防止旧批次/旧回补被误判为新数据
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.lock_state().buf.len()
    }

    #[cfg(test)]
    pub(crate) fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// 当前已分配的最大 seq（UI 判断滞后量的参考）。
    pub(crate) fn last_seq(&self) -> u64 {
        let state = self.lock_state();
        state.next_seq.saturating_sub(1)
    }

    /// 工人重启用：末条墙钟 + 同一时刻已入环身份，避免 `-T` 含时刻重入。
    pub(crate) fn resume_skip(&self) -> Option<ResumeSkip> {
        let state = self.lock_state();
        let last = state.buf.back()?;
        let ts = last.ts.clone();
        let identities = state
            .buf
            .iter()
            .filter(|l| l.ts == ts)
            .map(|l| (l.pid, l.tid, l.tag.to_string(), l.msg.clone()))
            .collect();
        Some(ResumeSkip { ts, identities })
    }

    #[cfg(test)]
    pub(crate) fn capacity(&self) -> usize {
        self.lock_state().capacity
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
        assert_eq!(ring.push(line(999)).seq, 0);
        assert_eq!(ring.push(line(999)).seq, 1);
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
        assert_eq!(ring.push(line(0)).seq, 1);
    }

    #[test]
    fn capacity_below_one_is_one() {
        assert_eq!(RingBuffer::new(0).capacity(), 1);
        let ring = RingBuffer::new(4);
        ring.set_capacity(0);
        assert_eq!(ring.capacity(), 1);
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

    #[test]
    fn repeated_tag_is_one_arc() {
        let ring = RingBuffer::new(10);
        let a = ring
            .push(LogLine {
                tag: "ActivityManager".into(),
                msg: "one".into(),
                ..LogLine::default()
            })
            .seq;
        let b = ring
            .push(LogLine {
                tag: "ActivityManager".into(),
                msg: "two".into(),
                ..LogLine::default()
            })
            .seq;
        assert!(ring.tag_ptr_eq(a, b));
    }

    #[test]
    fn capture_lock_sentence_once() {
        let owner_line = "self.inner.lock().expect(\"capture lock poisoned\")";
        let needle = "capture lock poisoned";
        let src = include_str!("capture.rs");
        let scanned = match src.split_once("mod tests") {
            Some((body, tests)) => format!("{body}{}", tests.replace(needle, "")),
            None => src.to_string(),
        };
        let scanned = scanned.replacen(owner_line, "", 1);
        assert!(!scanned.contains(needle), "{needle}");
    }
}
