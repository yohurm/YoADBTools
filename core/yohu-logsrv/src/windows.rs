//! 每窗口命中索引（ADR-v6-041）。
//!
//! 全文在环里。这里只存序号。信号计数不在本层：界面按可见行派生，core 不维护第二份。
//! 命中窗口都把正文交给批处理，界面文档自己追加。暂停由界面不写入。
//!
//! ## 登记与追加的原子性（P0）
//!
//! `bind` 在 **book 锁内**完成「取环快照上界 → 扫环重建 → 替换窗口」，`commit` 也在这把锁内追加。
//! 因此两者不可能交错：不存在「commit 写进旧窗口、随后被 bind 的 insert 覆盖」（丢行）
//! 或「扫环已含该行、commit 又追加一次」（重复）。
//!
//! 跨过一次登记的 `commit` 用序号水位 `binding_through` 判定归属：
//! - `seq < binding_through`：已由本次重建的扫描覆盖 → 丢弃（否则重复）。
//! - `seq >= binding_through`：扫描之后才入环 → 追加（否则丢行）。
//!
//! 水位是**独占上界**（`ring.next_seq()`，即「下一个将分配的 seq」），在扫描**之前**取。
//! 用 `next_seq` 而不是 `last_seq`：空环时 `last_seq` 为 0，与「首个分配出去的 seq=0」
//! 撞车，会把首行误判为已覆盖而丢掉。`push` 的 `seq` 单调递增，所以扫描期间入环的行
//! 序号必然 ≥ 水位，一定走追加分支。
//!
//! `binding_epoch` 是登记的单调序号，用来标识「这次绑定」。`prepare` 记下当时的
//! 世代栅栏（`Book::next_epoch`）；`commit` 若发现某窗口的 `binding_epoch` 已越过栅栏，
//! 说明它在 `prepare→push→commit` 之间被**重新绑定**（可能换了过滤）——此时不能用旧过滤
//! 的命中结果，必须用**当前窗口的 filter + from_seq** 对这条正文重判（命中才追加）。
//! 这样「改过滤的 bind 与在途 commit 交错」也满足对账不变量：
//! `hits == 环 ∩ 当前filter ∩ seq ≥ from_seq`。

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use yohu_domain::log_filter_matches;
use yohu_protocol::{LogFilter, LogLine, LogPage, LogWindowBind};

use crate::batch::HitNote;
use crate::ring::RingBuffer;

struct Window {
    id: u64,
    serial: String,
    filter: LogFilter,
    from_seq: u64,
    /// 登记世代：每次 `bind` 递增（`prepare` 携带，供断言与排障）。
    binding_epoch: u64,
    /// 本次重建扫描已覆盖的**下一个** seq（独占上界）。追加只接受 ≥ 它的序号。
    ///
    /// 用独占上界而不是 `last_seq`：空环时 `last_seq` 为 0，与「首个分配出去的 seq=0」
    /// 撞车，会把首行误判为「已被扫描覆盖」而丢掉。
    binding_through: u64,
    /// 命中序号，严格递增。
    hits: VecDeque<u64>,
}

struct Book {
    windows: HashMap<u64, Window>,
    next_epoch: u64,
}

/// `prepare` 的准入结果：哪些窗口在**当时**的过滤下命中该行，以及当时登记世代的栅栏值。
///
/// 正文仍归环所有，`commit` 在真正要追加/重判时才按 seq 取回。
pub(crate) struct Prepared {
    /// prepare 时命中该行的窗口 id。
    window_ids: Vec<u64>,
    /// prepare 时的登记世代栅栏（[`Book::next_epoch`]）。任何 `binding_epoch > 它` 的窗口
    /// 都在 prepare 之后被重新绑定过（可能换了过滤），`commit` 必须按当前过滤重判这条正文。
    epoch_fence: u64,
}

pub(crate) struct WindowBook {
    inner: Mutex<Book>,
}

impl WindowBook {
    pub(crate) fn new() -> Self {
        Self {
            inner: Mutex::new(Book {
                windows: HashMap::new(),
                next_epoch: 0,
            }),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Book> {
        self.inner.lock().expect("window index lock poisoned")
    }

    /// 按当前环重建索引，并返回要画的那一页。
    ///
    /// 扫环与替换窗口在同一临界区内完成；`ring` 为 `None` 表示该 serial 从未登记过采集
    /// （读路径不建环），此时登记一个空窗口。
    pub(crate) fn bind(&self, spec: LogWindowBind, ring: Option<&RingBuffer>) -> LogPage {
        let mut book = self.lock();
        // 水位在扫描**之前**取：`push` 的 seq 单调递增，扫描期间入环的行序号必然 ≥ 水位。
        let through = ring.map(|ring| ring.next_seq()).unwrap_or(0);
        let scan_to = through.saturating_sub(1);
        let mut hits = VecDeque::new();
        if let Some(ring) = ring {
            if through > 0 {
                ring.for_each_from(spec.from_seq, scan_to, |line| {
                    if log_filter_matches(&spec.filter, line) {
                        hits.push_back(line.seq);
                    }
                });
            }
        }
        book.next_epoch += 1;
        let epoch = book.next_epoch;
        book.windows.insert(
            spec.id,
            Window {
                id: spec.id,
                serial: spec.serial.clone(),
                filter: spec.filter,
                from_seq: spec.from_seq,
                binding_epoch: epoch,
                binding_through: through,
                hits,
            },
        );
        let window = book.windows.get(&spec.id).expect("just inserted");
        page_all(window, ring)
    }

    /// 释放窗口。世代继续递增：任何以此为目标的在途 `prepare` 都会因窗口不存在而落空。
    pub(crate) fn release(&self, id: u64) {
        let mut book = self.lock();
        book.windows.remove(&id);
        book.next_epoch += 1;
    }

    /// 环清空时丢掉序号，登记还在。水位保留：它只约束「重建扫描已覆盖到哪」，
    /// 而清空后新分配的序号一定大于清空前的任何序号。
    pub(crate) fn clear_serial(&self, serial: &str) {
        for window in self.lock().windows.values_mut() {
            if window.serial == serial {
                window.hits.clear();
            }
        }
    }

    /// 过滤发生在行进入环之前，只记下哪些窗口要这条（以及当前世代栅栏）。
    pub(crate) fn prepare(&self, serial: &str, line: &LogLine) -> Prepared {
        let book = self.lock();
        let mut window_ids = Vec::new();
        for window in book.windows.values() {
            if window.serial != serial {
                continue;
            }
            if !log_filter_matches(&window.filter, line) {
                continue;
            }
            window_ids.push(window.id);
        }
        Prepared {
            window_ids,
            epoch_fence: book.next_epoch,
        }
    }

    /// 序号已经分配。裁掉被环淘汰的命中，再按**当前**窗口状态追加这条。
    ///
    /// 只有「当前绑定未覆盖到」的序号可追加：`seq < binding_through` 已被本次重建扫描
    /// 覆盖（丢弃，否则重复）；`seq < from_seq` 在窗口起点之前（丢弃）。
    ///
    /// 归属判定：
    /// - 窗口 `binding_epoch ≤ epoch_fence`：绑定自 prepare 起没变，`prepare` 的命中即当前
    ///   过滤的判定，命中集合里的窗口直接追加。
    /// - 窗口 `binding_epoch > epoch_fence`：在 prepare 之后被重新绑定（可能是改过滤的
    ///   `bind`），旧命中的 `Prepared` 不可信；用当前窗口的 `filter` 对这条正文重判，
    ///   命中才追加（既拦「旧命中、新不命中」的多纳，也补「旧不命中、新命中」的漏纳）。
    pub(crate) fn commit(
        &self,
        serial: &str,
        seq: u64,
        oldest: u64,
        prepared: Prepared,
        ring: &RingBuffer,
    ) -> Vec<HitNote> {
        let mut book = self.lock();
        evict_before(&mut book, serial, oldest);
        let Prepared {
            window_ids,
            epoch_fence,
        } = prepared;
        let mut notes = Vec::new();
        // 正文按需取：只有真正要追加/重判时才从环克隆一次。
        let mut body: Option<Option<LogLine>> = None;
        for window in book.windows.values_mut() {
            if window.serial != serial || seq < window.from_seq || seq < window.binding_through {
                continue;
            }
            let append = if window.binding_epoch > epoch_fence {
                // 绑定变了：用当前过滤对这条正文重判。
                let Some(line) = body_of(&mut body, ring, seq) else {
                    continue;
                };
                log_filter_matches(&window.filter, line)
            } else {
                // 绑定未变：prepare 的命中即当前过滤的判定。
                window_ids.contains(&window.id)
            };
            if !append {
                continue;
            }
            window.hits.push_back(seq);
            let total = window.hits.len() as u64;
            let line = body_of(&mut body, ring, seq).cloned();
            notes.push(HitNote {
                window_id: window.id,
                total,
                line,
            });
        }
        notes
    }

    /// 对账用：某窗口的命中序号（仅测试与断言）。
    #[cfg(test)]
    pub(crate) fn hits_of(&self, id: u64) -> Vec<u64> {
        self.lock()
            .windows
            .get(&id)
            .map(|window| window.hits.iter().copied().collect())
            .unwrap_or_default()
    }
}

fn evict_before(book: &mut Book, serial: &str, oldest: u64) {
    for window in book.windows.values_mut() {
        if window.serial != serial {
            continue;
        }
        while window.hits.front().is_some_and(|seq| *seq < oldest) {
            window.hits.pop_front();
        }
    }
}

/// 惰性取回一条已入环的正文（`commit` 只在需要追加/重判时调用，最多克隆一次）。
fn body_of<'a>(
    cache: &'a mut Option<Option<LogLine>>,
    ring: &RingBuffer,
    seq: u64,
) -> Option<&'a LogLine> {
    cache
        .get_or_insert_with(|| ring.lines_by_seq(&[seq]).into_iter().next())
        .as_ref()
}

/// 登记 / 跟尾：返回视口内的全部可见命中（界面文档一次装入）。
fn page_all(window: &Window, ring: Option<&RingBuffer>) -> LogPage {
    let total = window.hits.len() as u64;
    let seqs: Vec<u64> = window.hits.iter().copied().collect();
    let lines = match ring {
        Some(ring) => ring.lines_by_seq(&seqs),
        None => Vec::new(),
    };
    LogPage {
        window_id: window.id,
        serial: window.serial.clone(),
        total,
        lines,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_protocol::LogFilter;

    fn line(msg: &str, level: char) -> LogLine {
        LogLine {
            ts: "2026-01-01 00:00:00.000".into(),
            pid: 1,
            tid: 1,
            level,
            tag: "T".into(),
            msg: msg.into(),
            ..LogLine::default()
        }
    }

    fn bind_all(book: &WindowBook, ring: &RingBuffer, id: u64) -> LogPage {
        book.bind(
            LogWindowBind {
                id,
                serial: "S".into(),
                filter: LogFilter::default(),
                from_seq: 0,
            },
            Some(ring),
        )
    }

    /// 测试内的独立对账：按「环 ∩ filter ∩ seq >= from_seq」重算期望序号。
    fn expected(ring: &RingBuffer, filter: &LogFilter, from_seq: u64) -> Vec<u64> {
        let mut out = Vec::new();
        let next = ring.next_seq();
        if next > 0 {
            ring.for_each_from(from_seq, next - 1, |line| {
                if log_filter_matches(filter, line) {
                    out.push(line.seq);
                }
            });
        }
        out
    }

    #[test]
    fn bind_keeps_matches_then_page_is_tail() {
        let ring = RingBuffer::new(10);
        ring.push(line("info", 'I'));
        ring.push(line("FATAL EXCEPTION: main", 'E'));
        ring.push(line("later", 'I'));
        let book = WindowBook::new();
        let page = book.bind(
            LogWindowBind {
                id: 7,
                serial: "S".into(),
                filter: LogFilter {
                    levels: vec!['E'],
                    ..LogFilter::default()
                },
                from_seq: 0,
            },
            Some(&ring),
        );
        assert_eq!(page.total, 1);
        assert_eq!(page.lines.len(), 1);
        assert_eq!(page.lines[0].msg, "FATAL EXCEPTION: main");
        assert_eq!(book.hits_of(7), vec![1]);
    }

    #[test]
    fn commit_moves_seq_and_evict_drops_oldest() {
        let ring = RingBuffer::new(2);
        let book = WindowBook::new();
        let _ = bind_all(&book, &ring, 1);
        for (msg, level) in [("one", 'E'), ("mid", 'I'), ("tail", 'I')] {
            let row = line(msg, level);
            let prepared = book.prepare("S", &row);
            let pushed = ring.push(row);
            let _ = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
        }
        let notes_total = book.hits_of(1).len();
        assert_eq!(notes_total, 2, "裁出环的命中不再留在索引");
        assert_eq!(book.hits_of(1), vec![1, 2]);
    }

    #[test]
    fn index_length_stays_at_ring_cap() {
        let ring = RingBuffer::new(8);
        let book = WindowBook::new();
        let _ = bind_all(&book, &ring, 1);
        let mut last_total = 0u64;
        for i in 0..40 {
            let row = line(&format!("m{i}"), 'I');
            let prepared = book.prepare("S", &row);
            let pushed = ring.push(row);
            let notes = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
            last_total = notes[0].total;
        }
        assert_eq!(last_total, 8);
        assert_eq!(ring.len(), 8);
    }

    /// P0 对账：登记与追加交错后，索引必须等于「环 ∩ filter ∩ seq >= from_seq」。
    ///
    /// 这里按真实交错重放：`prepare`（旧绑定）→ `push` → `bind`（重建）→ `commit`（迟到追加）。
    /// 旧实现会把迟到的 commit 写进已被替换的窗口（丢行）或重复写入（重复）。
    #[test]
    fn late_commit_after_rebind_matches_ring_reconciliation() {
        let ring = RingBuffer::new(100);
        let book = WindowBook::new();
        let _ = bind_all(&book, &ring, 1);

        // 先在环里放 3 行（已入索引）
        for i in 0..3 {
            let row = line(&format!("early {i}"), 'I');
            let prepared = book.prepare("S", &row);
            let pushed = ring.push(row);
            let _ = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
        }
        assert_eq!(book.hits_of(1), vec![0, 1, 2]);

        // 交错：prepare 拿到旧绑定的 epoch，push 分配 seq=3，随后 bind 重建，最后才 commit。
        let late = line("late", 'I');
        let prepared = book.prepare("S", &late);
        let pushed = ring.push(late);
        assert_eq!(pushed.seq, 3);
        let page = bind_all(&book, &ring, 1);
        assert_eq!(page.total, 4, "重建已看到 seq=3");
        let _ = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);

        assert_eq!(
            book.hits_of(1),
            expected(&ring, &LogFilter::default(), 0),
            "迟到追加不得重复"
        );
        assert_eq!(book.hits_of(1), vec![0, 1, 2, 3]);
    }

    /// 交错的反向：`push` 发生在重建扫描之后（seq 越过水位），迟到 commit 必须补进索引。
    #[test]
    fn commit_for_line_pushed_after_rebuild_scan_is_kept() {
        let ring = RingBuffer::new(100);
        let book = WindowBook::new();
        let _ = bind_all(&book, &ring, 1);
        for i in 0..2 {
            let row = line(&format!("old {i}"), 'I');
            let prepared = book.prepare("S", &row);
            let pushed = ring.push(row);
            let _ = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
        }

        // prepare 早于 bind，但 push 晚于 bind 的扫描上界 → 序号越过水位
        let fresh = line("fresh", 'I');
        let prepared = book.prepare("S", &fresh);
        let _ = bind_all(&book, &ring, 1);
        let pushed = ring.push(fresh);
        let notes = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);

        assert_eq!(notes.len(), 1, "扫描没覆盖到的行必须追加");
        assert_eq!(
            book.hits_of(1),
            expected(&ring, &LogFilter::default(), 0),
            "索引必须与环对账一致"
        );
        assert_eq!(book.hits_of(1), vec![0, 1, 2]);
    }

    /// P1-1 对账（排除方向）：`prepare`（旧过滤=全部）→ `bind`（改过滤=E）→ `push` → `commit`。
    /// 旧过滤命中、新过滤不命中的这条不得进入新窗口；索引必须等于「环 ∩ 新filter ∩ seq>=from_seq」。
    #[test]
    fn filter_narrowed_between_prepare_and_push_excludes_stale_hit() {
        let ring = RingBuffer::new(100);
        let book = WindowBook::new();
        let _ = bind_all(&book, &ring, 1);

        // 环里先放两类历史行（I 与 E），均已进索引。
        for (msg, level) in [("i0", 'I'), ("e0", 'E')] {
            let row = line(msg, level);
            let prepared = book.prepare("S", &row);
            let pushed = ring.push(row);
            let _ = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
        }
        assert_eq!(book.hits_of(1), expected(&ring, &LogFilter::default(), 0));

        // 交错：prepare 用旧过滤（全部）命中一条 I；bind 把过滤改成只 E；再 push；最后 commit。
        let late = line("late-info", 'I');
        let prepared = book.prepare("S", &late);
        assert!(prepared.window_ids.contains(&1), "旧过滤命中这条 I");

        let narrowed = LogFilter {
            levels: vec!['E'],
            ..LogFilter::default()
        };
        let page = book.bind(
            LogWindowBind {
                id: 1,
                serial: "S".into(),
                filter: narrowed.clone(),
                from_seq: 0,
            },
            Some(&ring),
        );
        // 重建时 late 还没入环：只看到历史 E 行。
        assert_eq!(page.total, 1);

        let pushed = ring.push(late);
        let notes = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
        assert!(
            notes.is_empty(),
            "旧过滤命中但新过滤不匹配的行不得进入新窗口"
        );
        assert_eq!(book.hits_of(1), expected(&ring, &narrowed, 0));
        assert_eq!(book.hits_of(1), vec![1], "只剩历史 e0");
    }

    /// P1-1 对账（补纳方向）：`prepare`（旧过滤=E）不命中一条 I → `bind`（放宽到全部）→ `push`
    /// → `commit`。缺的这条必须按新过滤补进；索引与环对账一致（不能漏纳）。
    #[test]
    fn filter_broadened_between_prepare_and_push_adds_missing_hit() {
        let ring = RingBuffer::new(100);
        let book = WindowBook::new();
        let only_e = LogFilter {
            levels: vec!['E'],
            ..LogFilter::default()
        };
        let _ = book.bind(
            LogWindowBind {
                id: 1,
                serial: "S".into(),
                filter: only_e,
                from_seq: 0,
            },
            Some(&ring),
        );

        // 历史只有一条 E。
        let row = line("e0", 'E');
        let prepared = book.prepare("S", &row);
        let pushed = ring.push(row);
        let _ = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
        assert_eq!(book.hits_of(1), vec![0]);

        // 交错：prepare 旧过滤（只 E）不命中 I；bind 放宽到全部；push；commit 必须补进。
        let late = line("late-info", 'I');
        let prepared = book.prepare("S", &late);
        assert!(prepared.window_ids.is_empty(), "旧过滤不命中这条 I");

        let widened = LogFilter::default();
        let page = book.bind(
            LogWindowBind {
                id: 1,
                serial: "S".into(),
                filter: widened.clone(),
                from_seq: 0,
            },
            Some(&ring),
        );
        assert_eq!(page.total, 1, "重建只看到历史 e0");

        let pushed = ring.push(late);
        let notes = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
        assert_eq!(notes.len(), 1, "新过滤命中、旧过滤漏掉的行必须补进");
        assert_eq!(book.hits_of(1), expected(&ring, &widened, 0));
        assert_eq!(book.hits_of(1), vec![0, 1], "历史 e0 + 补进的 I");
    }

    /// 换过滤（同一窗口再 bind）后索引整体重建，旧命中不再残留。
    #[test]
    fn rebind_with_new_filter_replaces_index() {
        let ring = RingBuffer::new(20);
        let book = WindowBook::new();
        ring.push(line("i", 'I'));
        ring.push(line("e", 'E'));
        ring.push(line("w", 'W'));
        let first = book.bind(
            LogWindowBind {
                id: 1,
                serial: "S".into(),
                filter: LogFilter::default(),
                from_seq: 0,
            },
            Some(&ring),
        );
        assert_eq!(first.total, 3);

        let filter = LogFilter {
            levels: vec!['E'],
            ..LogFilter::default()
        };
        let second = book.bind(
            LogWindowBind {
                id: 1,
                serial: "S".into(),
                filter: filter.clone(),
                from_seq: 0,
            },
            Some(&ring),
        );
        assert_eq!(second.total, 1);
        assert_eq!(book.hits_of(1), expected(&ring, &filter, 0));
        assert_eq!(book.hits_of(1), vec![1]);
    }

    /// `from_seq` 之前的历史不进索引；重建与后续追加都遵守它。
    #[test]
    fn from_seq_excludes_older_lines_and_gates_commit() {
        let ring = RingBuffer::new(20);
        let book = WindowBook::new();
        for i in 0..5 {
            ring.push(line(&format!("m{i}"), 'I'));
        }
        let page = book.bind(
            LogWindowBind {
                id: 1,
                serial: "S".into(),
                filter: LogFilter::default(),
                from_seq: 3,
            },
            Some(&ring),
        );
        assert_eq!(page.total, 2);
        assert_eq!(book.hits_of(1), vec![3, 4]);
    }

    /// 多个窗口在不同时刻登记（世代各不相同）：一条命中必须同时进入两边的索引。
    #[test]
    fn commit_reaches_every_matching_window_regardless_of_epoch() {
        let ring = RingBuffer::new(50);
        let book = WindowBook::new();
        // 窗口 1 先登记
        let _ = bind_all(&book, &ring, 1);
        // 写入一行，只进窗口 1
        let first = line("first", 'I');
        let prepared = book.prepare("S", &first);
        let pushed = ring.push(first);
        let _ = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
        // 窗口 2 后登记（不同世代），随后再来一行
        let _ = bind_all(&book, &ring, 2);
        let second = line("second", 'I');
        let prepared = book.prepare("S", &second);
        let pushed = ring.push(second);
        let notes = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);

        assert_eq!(notes.len(), 2, "两个窗口都要收到这条命中");
        let mut ids: Vec<u64> = notes.iter().map(|n| n.window_id).collect();
        ids.sort_unstable();
        assert_eq!(ids, vec![1, 2]);
        assert_eq!(book.hits_of(1), expected(&ring, &LogFilter::default(), 0));
        assert_eq!(book.hits_of(2), vec![0, 1], "窗口 2 重建时已含 seq=0，再追加 seq=1");
    }

    /// 释放后不得有幽灵窗口：窗口不存在时 commit 不产生任何命中，也不会被重建复活。
    #[test]
    fn release_leaves_no_ghost_window() {
        let ring = RingBuffer::new(20);
        let book = WindowBook::new();
        let _ = bind_all(&book, &ring, 1);
        let row = line("x", 'I');
        let prepared = book.prepare("S", &row);
        let pushed = ring.push(row);
        book.release(1);
        let notes = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
        assert!(notes.is_empty(), "已释放的窗口不得继续累积命中");
        assert!(book.hits_of(1).is_empty());
        assert!(book.prepare("S", &line("y", 'I')).window_ids.is_empty());
    }

    /// 释放后重新登记：旧的 `Prepared`（不同世代）不得把行重复写进新窗口。
    ///
    /// `release` 也推进 epoch 空间，因此「释放前的 prepared」永远匹配不上「释放后的窗口」；
    /// 序号水位再兜一层，保证重建扫描已覆盖的行不会二次进入索引。
    #[test]
    fn stale_prepared_after_release_and_rebind_does_not_duplicate() {
        let ring = RingBuffer::new(50);
        let book = WindowBook::new();
        let _ = bind_all(&book, &ring, 1);

        // 旧绑定下 prepare 一行，随后 push 入环
        let stale = line("stale", 'I');
        let stale_prepared = book.prepare("S", &stale);
        let pushed = ring.push(stale);
        assert_eq!(pushed.seq, 0);

        // 释放 → 重新登记（重建扫描已包含 seq=0）
        book.release(1);
        let page = bind_all(&book, &ring, 1);
        assert_eq!(page.total, 1);

        // 陈旧 prepared 迟到：不得重复追加
        let notes = book.commit("S", pushed.seq, pushed.oldest, stale_prepared, &ring);
        assert!(notes.is_empty(), "释放前的 prepared 不得写进新窗口");
        assert_eq!(book.hits_of(1), vec![0]);
        assert_eq!(
            book.hits_of(1),
            expected(&ring, &LogFilter::default(), 0),
            "索引必须与环对账一致"
        );
    }

    /// 环清空后登记还在，命中序号清空；新行仍按新序号进入索引。
    #[test]
    fn clear_serial_keeps_registration() {
        let ring = RingBuffer::new(20);
        let book = WindowBook::new();
        let _ = bind_all(&book, &ring, 1);
        let row = line("x", 'I');
        let prepared = book.prepare("S", &row);
        let pushed = ring.push(row);
        let _ = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
        assert_eq!(book.hits_of(1), vec![0]);

        ring.clear();
        book.clear_serial("S");
        assert!(book.hits_of(1).is_empty());

        let row = line("after", 'I');
        let prepared = book.prepare("S", &row);
        assert!(!prepared.window_ids.is_empty(), "登记仍在，新行照常命中");
        let pushed = ring.push(row);
        let notes = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
        assert_eq!(notes.len(), 1);
        assert_eq!(book.hits_of(1), vec![pushed.seq]);
    }

    /// 未登记的 serial（无环）也能 bind：空窗口、空页，不创建环。
    #[test]
    fn bind_without_ring_registers_empty_window() {
        let book = WindowBook::new();
        let page = book.bind(
            LogWindowBind {
                id: 9,
                serial: "NEVER".into(),
                filter: LogFilter::default(),
                from_seq: 0,
            },
            None,
        );
        assert_eq!(page.total, 0);
        assert!(page.lines.is_empty());
    }

    #[test]
    fn detached_window_still_receives_body() {
        let ring = RingBuffer::new(4);
        let book = WindowBook::new();
        let _ = bind_all(&book, &ring, 1);
        let row = line("x", 'I');
        let prepared = book.prepare("S", &row);
        assert!(!prepared.window_ids.is_empty());
    }

    /// 默认环 10 万条灌满后，命中索引长度贴合环上界，稳态单行代价不随容量爬升。
    #[test]
    fn stress_default_capacity_tracks_ring_cap() {
        const CAP: usize = 100_000;
        const STEADY: usize = 2_000;
        let ring = RingBuffer::new(CAP);
        let book = WindowBook::new();
        let _ = bind_all(&book, &ring, 1);
        let tags = ["ActivityManager", "SystemServer", "OkHttp", "flutter"];
        let fill_started = std::time::Instant::now();
        for i in 0..CAP {
            let row = LogLine {
                ts: "2026-01-01 00:00:00.000".into(),
                pid: (i % 400) as u32,
                tid: 1,
                level: 'I',
                tag: tags[i % tags.len()].into(),
                msg: format!("payload {i} steady log line for the device ring"),
                ..LogLine::default()
            };
            let prepared = book.prepare("S", &row);
            let pushed = ring.push(row);
            let _ = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
        }
        let fill = fill_started.elapsed();
        let steady_started = std::time::Instant::now();
        let mut last_total = 0u64;
        for i in 0..STEADY {
            let row = line(&format!("tail {i}"), 'I');
            let prepared = book.prepare("S", &row);
            let pushed = ring.push(row);
            let notes = book.commit("S", pushed.seq, pushed.oldest, prepared, &ring);
            last_total = notes[0].total;
        }
        let steady = steady_started.elapsed();
        // 取页通路已删除：用 bind 重建索引，验证命中索引贴合环上界（全部命中一次装入）。
        let page = book.bind(
            LogWindowBind {
                id: 1,
                serial: "S".into(),
                filter: LogFilter::default(),
                from_seq: 0,
            },
            Some(&ring),
        );
        eprintln!(
            "log stress cap={CAP} fill={fill:?} steady_{STEADY}={steady:?} hits={}",
            page.total
        );
        assert_eq!(ring.len(), CAP);
        assert_eq!(last_total, CAP as u64);
        assert_eq!(page.total, CAP as u64);
        assert_eq!(page.lines.len(), CAP);
        let fill_ns = fill.as_nanos() / CAP as u128;
        let steady_ns = steady.as_nanos() / STEADY as u128;
        assert!(
            steady_ns < fill_ns.saturating_mul(8).max(1),
            "环满后单行耗时不应随容量爬升: fill {fill_ns}ns steady {steady_ns}ns"
        );
        let (fill_limit, steady_limit) = if cfg!(debug_assertions) {
            (
                std::time::Duration::from_secs(120),
                std::time::Duration::from_secs(15),
            )
        } else {
            (
                std::time::Duration::from_secs(12),
                std::time::Duration::from_millis(800),
            )
        };
        assert!(fill < fill_limit, "灌满 10 万行超出预算: {fill:?}");
        assert!(
            steady < steady_limit,
            "环满后 {STEADY} 行超出预算: {steady:?}"
        );
    }
}
