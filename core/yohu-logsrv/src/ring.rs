//! 设备级共享环形缓冲（ADR-v6-006）。
//!
//! - `seq` 单调递增（设备内），是回补/溢出检测的锚点
//! - 设备切换/掉线 → `clear()`（防串设备）
//! - 导出/重放永远基于本缓冲快照（与推送通道状态无关 → 数据不丢）
//! - 过滤不在本环：导出在 `export` 调 domain `log_filter_matches`
//!
//! 容量**不**由本类型持有：唯一 owner 是 [`crate::ring_store::RingStore`]，
//! 它在 `set_capacity` 里向所有已存在环下推。本类型只保留一份只读镜像供 `push` 淘汰用，
//! 并以 `debug_assert` 锁住「镜像 == store 容量」。

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, MutexGuard};

use yohu_protocol::LogLine;

/// 环内一行。Tag 驻留，消息正文只存一份。
struct StoredLine {
    seq: u64,
    ts: String,
    pid: u32,
    tid: u32,
    uid: Option<String>,
    level: char,
    tag: Arc<str>,
    msg: String,
}

struct State {
    buf: VecDeque<StoredLine>,
    next_seq: u64,
    /// 只读镜像：唯一写入点是 [`RingBuffer::install_capacity`]（由 `RingStore` 调用）。
    capacity: usize,
    tags: HashMap<String, Arc<str>>,
}

/// 写入结果：分配到的 seq。
pub(crate) struct Pushed {
    pub seq: u64,
}

/// 环容量至少为 1。钳制的唯一执行点是 [`crate::ring_store::RingStore`]。
pub(crate) fn ring_capacity(capacity: usize) -> usize {
    capacity.max(1)
}

/// `for_each_from` 的分块快照大小：每轮锁内最多克隆这么多条行。
const FOR_EACH_CHUNK: usize = 512;

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

/// 系统行（`--------- beginning of …`）的墙钟是空串：它不是时间，不参与续流比较。
pub(crate) fn is_system_timestamp(ts: &str) -> bool {
    ts.is_empty()
}

/// 设备级共享环形缓冲。
pub(crate) struct RingBuffer {
    inner: Mutex<State>,
}

impl RingBuffer {
    fn lock_state(&self) -> MutexGuard<'_, State> {
        self.inner.lock().expect("ring lock poisoned")
    }

    /// 只在 [`crate::ring_store::RingStore`] 内创建：容量已由 store 钳制。
    pub(crate) fn new(capacity: usize) -> Self {
        debug_assert!(capacity >= 1, "容量钳制归 RingStore：传入 {capacity}");
        Self {
            inner: Mutex::new(State {
                buf: VecDeque::with_capacity(capacity),
                next_seq: 0,
                capacity,
                tags: HashMap::new(),
            }),
        }
    }

    /// 由 [`crate::ring_store::RingStore`] 下推容量。已超出的旧记录立即从头部淘汰。
    ///
    /// 本方法不是公开写入口：`RingBuffer` 不自持可写容量，避免出现「store 一个值、
    /// 每个环各一个值」的三处容量。
    pub(crate) fn install_capacity(&self, capacity: usize) {
        debug_assert!(capacity >= 1, "容量钳制归 RingStore：传入 {capacity}");
        let mut state = self.lock_state();
        state.capacity = capacity;
        state.evict_overflow();
    }

    /// 写入一条 logd 记录（分配 seq）。所有权留在环内，Tag 驻留。
    ///
    /// **序号唯一源是本环**：传入行里的 `seq` 只是占位（[`crate::record::UNASSIGNED_SEQ`]），
    /// 一律被这里分配的序号覆盖。任何入环前自带的序号都不生效。
    pub(crate) fn push(&self, line: LogLine) -> Pushed {
        let mut state = self.lock_state();
        let seq = state.next_seq;
        let tag = State::intern(&mut state.tags, line.tag);
        state.buf.push_back(StoredLine {
            seq,
            ts: line.ts,
            pid: line.pid,
            tid: line.tid,
            uid: line.uid,
            level: line.level,
            tag,
            msg: line.msg,
        });
        state.evict_overflow();
        state.next_seq += 1;
        Pushed { seq }
    }

    /// 从 `from_seq` 起遍历到 `through`（含），供导出扫环。
    ///
    /// 分块快照：每轮锁内只克隆 ≤ [`FOR_EACH_CHUNK`] 条 `LogLine`，解锁后再交给 `visit`，
    /// 再取下一块。这样长时间扫描不会整段持锁，`push` 不必等整段扫完。
    /// 环内序号连续，故用 `cursor = 末条.seq + 1` 推进；块为空或不足一块即结束。
    ///
    /// `through` 是**内部**快照上界（导出先取一次 [`RingBuffer::last_seq`]，窗口登记取
    /// [`RingBuffer`] 的 `through` 取 `last_seq` 的前一位，不是 wire 字段：扫到 `through` 即止，
    /// 导出内容因此不随扫描期间的写入速率变化。
    pub(crate) fn for_each_from(&self, from_seq: u64, through: u64, mut visit: impl FnMut(&LogLine)) {
        let mut cursor = from_seq;
        loop {
            let chunk: Vec<LogLine> = {
                let state = self.lock_state();
                let Some(front) = state.buf.front().map(|line| line.seq) else {
                    break;
                };
                // 快照上界早于最旧存活行：本快照的行已被全部淘汰，不得再往新行上溢出。
                if through < front {
                    break;
                }
                // VecDeque 内序号连续：直接按 `seq - front.seq` 取下标窗口，O(chunk) 而非重扫前缀。
                let start = cursor.saturating_sub(front) as usize;
                // 快照上界：越过 `through` 的行不属于本次快照。
                let window = through.saturating_sub(front).saturating_add(1) as usize;
                let end = start
                    .saturating_add(FOR_EACH_CHUNK)
                    .min(window)
                    .min(state.buf.len());
                if start >= end {
                    break;
                }
                state.buf.range(start..end).map(State::to_wire).collect()
            };
            let Some(last) = chunk.last() else {
                break;
            };
            let next = last.seq.saturating_add(1);
            let full = chunk.len() == FOR_EACH_CHUNK;
            for line in &chunk {
                visit(line);
            }
            if !full {
                break;
            }
            cursor = next;
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

    /// 当前已分配的最大 seq（UI 判断滞后量的参考）。空环为 0（`next_seq` 的饱和下界）。
    pub(crate) fn last_seq(&self) -> u64 {
        let state = self.lock_state();
        state.next_seq.saturating_sub(1)
    }

    /// 工人重启用：最近一条**非空墙钟**的墙钟 + 同一时刻已入环身份，避免 `-T` 含时刻重入。
    ///
    /// 末条可能是系统行（`ts=""`），不能拿它当续流锚点：`-T ""` 会被 logcat 解析成
    /// 非法值并回落 `tail_lines=1`（掉行）。这里只认最近一条非空 `ts` 的记录。
    pub(crate) fn resume_skip(&self) -> Option<ResumeSkip> {
        let state = self.lock_state();
        let last = state
            .buf
            .iter()
            .rev()
            .find(|l| !is_system_timestamp(&l.ts))?;
        let ts = last.ts.clone();
        let identities = state
            .buf
            .iter()
            .filter(|l| l.ts == ts)
            .map(|l| (l.pid, l.tid, l.tag.to_string(), l.msg.clone()))
            .collect();
        Some(ResumeSkip { ts, identities })
    }

    /// 只读镜像：唯一 owner 是 [`crate::ring_store::RingStore::capacity`]。
    /// 供 `RingStore::set_capacity` 的 `debug_assert` 与测试读取。
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

    /// 序号唯一源是环：入环前自带的 `seq` 一律被覆盖（占位值不参与分配）。
    #[test]
    fn ring_overrides_any_preassigned_seq() {
        let ring = RingBuffer::new(10);
        // 传入 seq=999，环仍从 0 开始分配
        let pushed = ring.push(line(999));
        assert_eq!(pushed.seq, 0);
        let stored = ring.snapshot(0, 10);
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].seq, 0, "环内序号由环分配，不继承入参");
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
    fn snapshot_from_seq() {
        let ring = RingBuffer::new(10);
        for _ in 0..5 {
            ring.push(line(0));
        }
        let from_two = ring.snapshot(2, 10);
        assert_eq!(from_two.len(), 3);
        assert_eq!(from_two[0].seq, 2);
    }

    /// 分块遍历跨多个块仍返回全部行且顺序正确（覆盖 >512 条，强制多轮快照）。
    #[test]
    fn for_each_from_chunks_whole_ring_in_order() {
        const N: u64 = 5_000;
        assert!(N as usize > FOR_EACH_CHUNK, "必须跨块");
        let ring = RingBuffer::new(N as usize);
        for i in 0..N {
            ring.push(line(i));
        }
        let mut seqs = Vec::with_capacity(N as usize);
        ring.for_each_from(0, ring.last_seq(), |line| seqs.push(line.seq));
        assert_eq!(seqs.len(), N as usize, "分块遍历不得漏行");
        assert!(
            seqs.windows(2).all(|w| w[1] == w[0] + 1),
            "分块遍历顺序必须连续递增"
        );
        assert_eq!(seqs.first().copied(), Some(0));
        assert_eq!(seqs.last().copied(), Some(N - 1));

        let mut tail = Vec::new();
        ring.for_each_from(N - 3, ring.last_seq(), |line| tail.push(line.seq));
        assert_eq!(tail, vec![N - 3, N - 2, N - 1], "from_seq 必须生效");
    }

    /// `through` 是快照上界：扫描期间新入环的行不得进入本次遍历（导出边界固定）。
    #[test]
    fn for_each_from_stops_at_through_snapshot_bound() {
        let ring = RingBuffer::new(100);
        for i in 0..10 {
            ring.push(line(i));
        }
        let through = ring.last_seq();
        assert_eq!(through, 9);

        let mut seen = Vec::new();
        ring.for_each_from(0, through, |row| {
            seen.push(row.seq);
            // 扫描过程中继续写入：超出 `through` 的行不得被本次遍历看到
            if row.seq == 2 {
                for i in 10..40 {
                    ring.push(line(i));
                }
            }
        });
        assert_eq!(seen, (0..=9).collect::<Vec<u64>>(), "上界之后的行不得进入快照");

        // 新的一次遍历（重新取 through）能看到全部
        let mut all = Vec::new();
        ring.for_each_from(0, ring.last_seq(), |line| all.push(line.seq));
        assert_eq!(all.len(), 40);
        assert_eq!(all.last().copied(), Some(39));
    }

    /// 快照的行在扫描期间被**全部淘汰**：遍历必须停下，不得把新行溢出进本次快照。
    #[test]
    fn for_each_from_stops_when_snapshot_rows_are_evicted() {
        // 容量 4：写 4 行后取 through，扫描期间再写 8 行把旧行全部挤出
        let ring = RingBuffer::new(4);
        for i in 0..4 {
            ring.push(line(i));
        }
        let through = ring.last_seq();
        assert_eq!(through, 3);

        let mut seen = Vec::new();
        ring.for_each_from(0, through, |row| {
            seen.push(row.seq);
            if row.seq == 0 {
                for i in 4..12 {
                    ring.push(line(i));
                }
            }
        });
        assert!(
            seen.iter().all(|seq| *seq <= through),
            "不得越过快照上界（实测 {seen:?}）"
        );
        assert!(!seen.is_empty(), "首块仍应可读到");
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
        assert_eq!(ring_capacity(0), 1);
        assert_eq!(ring_capacity(4), 4);
        // RingStore 钳制后下推：环只接收已钳制的值
        let ring = RingBuffer::new(ring_capacity(0));
        assert_eq!(ring.capacity(), 1);
    }

    #[test]
    fn install_capacity_trims_oldest() {
        let ring = RingBuffer::new(5);
        for _ in 0..5 {
            ring.push(line(0));
        }
        ring.install_capacity(2);
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
    fn resume_skip_ignores_trailing_system_line() {
        let ring = RingBuffer::new(10);
        ring.push(LogLine {
            ts: "2026-01-01 00:00:01.000".into(),
            pid: 2,
            tid: 2,
            tag: "B".into(),
            msg: "new".into(),
            ..LogLine::default()
        });
        // 末条系统行 ts 为空：不得当续流锚点
        ring.push(LogLine {
            msg: "--------- beginning of main".into(),
            ..LogLine::default()
        });
        let skip = ring.resume_skip().expect("应取最近非空 ts");
        assert_eq!(skip.ts, "2026-01-01 00:00:01.000");
        assert_eq!(skip.identities, vec![(2, 2, "B".into(), "new".into())]);
    }

    #[test]
    fn resume_skip_none_when_only_system_lines() {
        let ring = RingBuffer::new(10);
        ring.push(LogLine {
            msg: "--------- beginning of main".into(),
            ..LogLine::default()
        });
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
}
