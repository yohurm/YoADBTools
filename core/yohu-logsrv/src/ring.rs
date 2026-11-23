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

use yohu_protocol::{LogFilter, LogLine};

/// 环内一行。Tag 驻留，消息/时间戳用 `Arc<str>`：快照克隆只做原子自增，正文不复制。
#[derive(Clone)]
struct StoredLine {
    seq: u64,
    ts: Arc<str>,
    pid: u32,
    tid: u32,
    uid: Option<Arc<str>>,
    level: char,
    tag: Arc<str>,
    msg: Arc<str>,
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
/// 单次 `snapshot` 每轮锁内复制的最大行数（Arc 指针），控制锁持有时间。
const SNAPSHOT_CHUNK: usize = 1024;

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
            ts: line.ts.to_string(),
            pid: line.pid,
            tid: line.tid,
            uid: line.uid.as_deref().map(str::to_string),
            level: line.level,
            tag: line.tag.to_string(),
            msg: line.msg.to_string(),
        }
    }

    /// 列式二进制编码（P0-3）：一次 `Vec<u8>`，无 JSON 键名、无逐行对象。
    ///
    /// 布局（小端）：
    /// ```text
    /// u32 count
    /// u32 tag_count ; [u32 len + bytes]*tag_count
    /// u8[count] level
    /// u32[count] tag_idx
    /// u64[count] seq
    /// u32[count] pid
    /// u32[count] tid
    /// u8[count]  uid_flag
    /// u32[count+1] uid_off  (相对 uid_blob)
    /// u32[count+1] ts_off   (相对 ts_blob)
    /// u32[count+1] msg_off  (相对 msg_blob)
    /// u32 uid_blob_len + bytes
    /// u32 ts_blob_len  + bytes
    /// u32 msg_blob_len + bytes
    /// ```
    fn encode_rows(rows: &[StoredLine]) -> Vec<u8> {
        let mut tags: Vec<&str> = Vec::new();
        let mut tag_map: HashMap<&str, u32> = HashMap::new();
        let mut tag_idx: Vec<u32> = Vec::with_capacity(rows.len());
        for r in rows {
            let t: &str = r.tag.as_ref();
            let idx = *tag_map.entry(t).or_insert_with(|| {
                let i = tags.len() as u32;
                tags.push(t);
                i
            });
            tag_idx.push(idx);
        }
        let mut uid_blob: Vec<u8> = Vec::new();
        let mut ts_blob: Vec<u8> = Vec::new();
        let mut msg_blob: Vec<u8> = Vec::new();
        let mut uid_off: Vec<u32> = Vec::with_capacity(rows.len() + 1);
        let mut ts_off: Vec<u32> = Vec::with_capacity(rows.len() + 1);
        let mut msg_off: Vec<u32> = Vec::with_capacity(rows.len() + 1);
        uid_off.push(0);
        ts_off.push(0);
        msg_off.push(0);
        for r in rows {
            if let Some(uid) = &r.uid {
                uid_blob.extend_from_slice(uid.as_bytes());
            }
            uid_off.push(uid_blob.len() as u32);
            ts_blob.extend_from_slice(r.ts.as_bytes());
            ts_off.push(ts_blob.len() as u32);
            msg_blob.extend_from_slice(r.msg.as_bytes());
            msg_off.push(msg_blob.len() as u32);
        }
        let mut out: Vec<u8> = Vec::with_capacity(
            16 + rows.len() * 30 + ts_blob.len() + msg_blob.len() + uid_blob.len(),
        );
        let w32 = |o: &mut Vec<u8>, x: u32| o.extend_from_slice(&x.to_le_bytes());
        let w64 = |o: &mut Vec<u8>, x: u64| o.extend_from_slice(&x.to_le_bytes());
        w32(&mut out, rows.len() as u32);
        w32(&mut out, tags.len() as u32);
        for t in &tags {
            w32(&mut out, t.len() as u32);
            out.extend_from_slice(t.as_bytes());
        }
        for r in rows {
            out.push(r.level as u8);
        }
        for idx in &tag_idx {
            w32(&mut out, *idx);
        }
        for r in rows {
            w64(&mut out, r.seq);
        }
        for r in rows {
            w32(&mut out, r.pid);
        }
        for r in rows {
            w32(&mut out, r.tid);
        }
        for r in rows {
            out.push(u8::from(r.uid.is_some()));
        }
        for x in &uid_off {
            w32(&mut out, *x);
        }
        for x in &ts_off {
            w32(&mut out, *x);
        }
        for x in &msg_off {
            w32(&mut out, *x);
        }
        w32(&mut out, uid_blob.len() as u32);
        out.extend_from_slice(&uid_blob);
        w32(&mut out, ts_blob.len() as u32);
        out.extend_from_slice(&ts_blob);
        w32(&mut out, msg_blob.len() as u32);
        out.extend_from_slice(&msg_blob);
        out
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
            ts: Arc::from(line.ts),
            pid: line.pid,
            tid: line.tid,
            uid: line.uid.map(Arc::from),
            level: line.level,
            tag,
            msg: Arc::from(line.msg),
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

    /// 取 `[from_seq, …]` 前 `limit` 条：锁内只按 `seq - 最旧seq` 下标克隆 `Arc` 指针，
    /// 分块（≤ [`SNAPSHOT_CHUNK`]）避免长持锁。
    fn snapshot_stored(&self, from_seq: u64, limit: usize) -> Vec<StoredLine> {
        let mut out = Vec::with_capacity(limit.min(SNAPSHOT_CHUNK));
        let mut cursor = from_seq;
        while out.len() < limit {
            let chunk: Vec<StoredLine> = {
                let state = self.lock_state();
                let Some(front) = state.buf.front().map(|line| line.seq) else {
                    break;
                };
                let start = cursor.saturating_sub(front) as usize;
                if start >= state.buf.len() {
                    break;
                }
                let remaining = limit - out.len();
                let end = start
                    .saturating_add(remaining.min(SNAPSHOT_CHUNK))
                    .min(state.buf.len());
                if end <= start {
                    break;
                }
                state.buf.range(start..end).cloned().collect()
            };
            let n = chunk.len();
            let next = chunk.last().map(|l| l.seq.saturating_add(1));
            out.extend(chunk);
            match next {
                Some(seq) if n == SNAPSHOT_CHUNK && out.len() < limit => cursor = seq,
                _ => break,
            }
        }
        out
    }

    /// 快照：从指定序号起的前 `limit` 条记录（回补/导出用）。
    pub(crate) fn snapshot(&self, from_seq: u64, limit: usize) -> Vec<LogLine> {
        self.snapshot_stored(from_seq, limit)
            .iter()
            .map(State::to_wire)
            .collect()
    }

    /// 列式二进制快照（P0-3，UI `log.range` 专用）。
    pub(crate) fn encode_range(&self, from_seq: u64, limit: usize) -> Vec<u8> {
        State::encode_rows(&self.snapshot_stored(from_seq, limit))
    }

    /// 环边界：`(first_seq, last_seq)`；空环为 `(0, 0)`。
    pub(crate) fn bounds(&self) -> (u64, u64) {
        let state = self.lock_state();
        let first = state.buf.front().map(|l| l.seq).unwrap_or(0);
        (first, state.next_seq.saturating_sub(1))
    }

    /// core 侧过滤分页（ADR-v6-050）：在环上按 `log_filter_matches` 过滤，
    /// `forward` 取最早 `limit` 条命中，`backward` 取最晚 `limit` 条命中（结果升序）。
    /// 返回 `(lines, has_more)`。
    pub(crate) fn query_filtered(
        &self,
        filter: &LogFilter,
        from_seq: u64,
        to_seq: u64,
        limit: usize,
        backward: bool,
    ) -> (Vec<LogLine>, bool) {
        if limit == 0 {
            return (Vec::new(), false);
        }
        let (_, last) = self.bounds();
        if backward {
            // backward：from_seq 是上界，to_seq 是下界。
            self.query_backward(filter, from_seq.min(last), to_seq, limit)
        } else {
            self.query_forward(filter, from_seq, to_seq.min(last), limit)
        }
    }

    fn query_forward(
        &self,
        filter: &LogFilter,
        from_seq: u64,
        hi: u64,
        limit: usize,
    ) -> (Vec<LogLine>, bool) {
        let mut out: Vec<LogLine> = Vec::with_capacity(limit);
        let mut cursor = from_seq;
        let mut has_more = false;
        'outer: loop {
            let chunk = self.snapshot_stored(cursor, SNAPSHOT_CHUNK);
            if chunk.is_empty() {
                break;
            }
            for line in &chunk {
                if line.seq > hi {
                    break 'outer;
                }
                let wire = State::to_wire(line);
                if yohu_domain::log_filter_matches(filter, &wire) {
                    if out.len() == limit {
                        has_more = true;
                        break 'outer;
                    }
                    out.push(wire);
                }
            }
            if chunk.len() < SNAPSHOT_CHUNK {
                break;
            }
            let next = chunk.last().map(|l| l.seq.saturating_add(1)).unwrap_or(cursor);
            if next <= cursor || next > hi {
                break;
            }
            cursor = next;
        }
        (out, has_more)
    }

    fn query_backward(
        &self,
        filter: &LogFilter,
        start: u64,
        lo: u64,
        limit: usize,
    ) -> (Vec<LogLine>, bool) {
        let mut out: Vec<LogLine> = Vec::with_capacity(limit);
        let mut has_more = false;
        let mut end_excl = start.saturating_add(1);
        'outer: loop {
            if end_excl == 0 {
                break;
            }
            let (chunk_begin, chunk): (u64, Vec<StoredLine>) = {
                let state = self.lock_state();
                let Some(front) = state.buf.front().map(|l| l.seq) else {
                    break;
                };
                if end_excl <= front {
                    break;
                }
                let end_idx = (end_excl - front) as usize;
                let begin_idx = end_idx.saturating_sub(SNAPSHOT_CHUNK);
                (
                    front + begin_idx as u64,
                    state.buf.range(begin_idx..end_idx).cloned().collect(),
                )
            };
            if chunk.is_empty() {
                break;
            }
            for line in chunk.iter().rev() {
                if line.seq < lo {
                    break 'outer;
                }
                let wire = State::to_wire(line);
                if yohu_domain::log_filter_matches(filter, &wire) {
                    if out.len() == limit {
                        has_more = true;
                        break 'outer;
                    }
                    out.push(wire);
                }
            }
            if chunk.len() < SNAPSHOT_CHUNK {
                break;
            }
            end_excl = chunk_begin;
        }
        out.reverse();
        (out, has_more)
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
        let ts = last.ts.to_string();
        let identities = state
            .buf
            .iter()
            .filter(|l| l.ts.as_ref() == ts.as_str())
            .map(|l| (l.pid, l.tid, l.tag.to_string(), l.msg.to_string()))
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
    fn query_filtered_forward_backward() {
        let ring = RingBuffer::new(100);
        for i in 0..10u32 {
            ring.push(LogLine {
                seq: 0,
                ts: format!("ts{i}"),
                pid: i,
                tid: 1,
                uid: None,
                level: if i % 2 == 1 { 'E' } else { 'I' },
                tag: "T".into(),
                msg: format!("m{i}"),
            });
        }
        let filter = LogFilter {
            levels: vec!['E'],
            ..Default::default()
        };
        let (fwd, more) = ring.query_filtered(&filter, 0, 9, 2, false);
        assert_eq!(fwd.iter().map(|l| l.seq).collect::<Vec<_>>(), vec![1, 3]);
        assert!(more, "forward 还有更多命中");
        let (fwd2, _) = ring.query_filtered(&filter, 4, 9, 2, false);
        assert_eq!(fwd2.iter().map(|l| l.seq).collect::<Vec<_>>(), vec![5, 7]);
        let (bwd, more_b) = ring.query_filtered(&filter, 9, 0, 2, true);
        assert_eq!(bwd.iter().map(|l| l.seq).collect::<Vec<_>>(), vec![7, 9]);
        assert!(more_b, "backward 还有更多命中");
        assert_eq!(ring.bounds(), (0, 9));
    }

    #[test]
    fn encode_range_columnar_roundtrip() {
        let ring = RingBuffer::new(10);
        ring.push(LogLine {
            seq: 0,
            ts: "t".into(),
            pid: 1,
            tid: 2,
            uid: None,
            level: 'I',
            tag: "T".into(),
            msg: "m".into(),
        });
        let buf = ring.encode_range(0, 10);
        let u32_at = |o: usize| u32::from_le_bytes(buf[o..o + 4].try_into().unwrap());
        assert_eq!(u32_at(0), 1, "count");
        assert_eq!(u32_at(4), 1, "tag_count");
        assert_eq!(u32_at(8), 1, "tag len");
        assert_eq!(buf[12], b'T');
        assert_eq!(buf[13], b'I', "level");
        assert_eq!(u32_at(14), 0, "tag_idx");
        // 末尾两段 blob：ts="t", msg="m"
        let tail = &buf[buf.len() - 10..];
        assert_eq!(tail[0..4], 1u32.to_le_bytes(), "ts_blob_len");
        assert_eq!(tail[4], b't');
        assert_eq!(tail[5..9], 1u32.to_le_bytes(), "msg_blob_len");
        assert_eq!(tail[9], b'm');
    }

    #[test]
    #[ignore = "性能基准：cargo test -p yohu-logsrv perf_ --release -- --ignored --nocapture"]
    fn perf_snapshot_tail_is_o_limit() {
        let ring = RingBuffer::new(100_000);
        for i in 0..100_000u32 {
            ring.push(LogLine {
                seq: 0,
                ts: "2026-01-01 00:00:00.000".into(),
                pid: i,
                tid: 1,
                uid: None,
                level: 'I',
                tag: format!("Tag{}", i % 64),
                msg: format!("message body {i}"),
            });
        }
        let start = std::time::Instant::now();
        let mut total = 0usize;
        for _ in 0..200 {
            total += ring.snapshot(95_000, 5_000).len();
        }
        let elapsed = start.elapsed();
        println!(
            "snapshot tail: 200x5000 rows in {:?} (avg {:?}), rows={total}",
            elapsed,
            elapsed / 200
        );
        assert_eq!(total, 200 * 5_000);
    }

    #[test]
    #[ignore = "性能基准：cargo test -p yohu-logsrv perf_ --release -- --ignored --nocapture"]
    fn perf_encode_100k_columnar() {
        let ring = RingBuffer::new(100_000);
        for i in 0..100_000u32 {
            ring.push(LogLine {
                seq: 0,
                ts: "2026-01-01 00:00:00.000".into(),
                pid: i,
                tid: 1,
                uid: None,
                level: 'I',
                tag: format!("Tag{}", i % 64),
                msg: format!("message body {i}"),
            });
        }
        let start = std::time::Instant::now();
        let bytes = ring.encode_range(0, 100_000);
        let elapsed = start.elapsed();
        println!("encode 100k rows -> {} bytes in {:?}", bytes.len(), elapsed);
        assert!(!bytes.is_empty());
    }

    /// 生成跨语言契约 fixture：`cargo test -p yohu-logsrv write_log_range_fixture -- --ignored`
    /// 写入 `ui/packages/api/testdata/log-range.bin`，由 `log-range.test.ts` 解码校验。
    #[test]
    #[ignore = "生成 fixture 用，手动运行一次并提交产物"]
    fn write_log_range_fixture() {
        let ring = RingBuffer::new(10);
        ring.push(LogLine {
            seq: 0,
            ts: "2026-01-01 00:00:00.000".into(),
            pid: 100,
            tid: 1,
            uid: Some("u0".into()),
            level: 'I',
            tag: "TagA".into(),
            msg: "hello".into(),
        });
        ring.push(LogLine {
            seq: 0,
            ts: "2026-01-01 00:00:00.001".into(),
            pid: 101,
            tid: 2,
            uid: None,
            level: 'E',
            tag: "TagA".into(),
            msg: "world".into(),
        });
        let bytes = ring.encode_range(0, 10);
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../ui/packages/api/testdata/log-range.bin"
        );
        std::fs::create_dir_all(std::path::Path::new(path).parent().unwrap()).unwrap();
        std::fs::write(path, &bytes).unwrap();
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
