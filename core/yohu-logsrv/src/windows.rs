//! 每窗口命中索引（ADR-v6-041）。
//!
//! 全文在环里。这里只存序号。信号在准入时加减。
//! 命中窗口都把正文交给批处理，界面文档自己追加。暂停由界面不写入。

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use yohu_domain::{log_filter_matches, scan_signal};
use yohu_protocol::{LogFilter, LogLine, LogPage, LogWindowBind};

use crate::batch::HitNote;
use crate::ring::RingBuffer;

struct IndexedHit {
    seq: u64,
    signal: bool,
}

struct Window {
    id: u64,
    serial: String,
    filter: LogFilter,
    from_seq: u64,
    following: bool,
    through_seq: Option<u64>,
    hits: VecDeque<IndexedHit>,
    signals: u32,
}

struct Book {
    windows: HashMap<u64, Window>,
}

/// 准入前看过的命中。正文还在调用方手里，这里不克隆。
pub(crate) struct Prepared {
    signal: bool,
    hits: Vec<PreparedHit>,
}

pub(crate) struct PreparedHit {
    window_id: u64,
}

impl Prepared {
    pub(crate) fn needs_body(&self) -> bool {
        !self.hits.is_empty()
    }
}

pub(crate) struct WindowBook {
    inner: Mutex<Book>,
}

impl WindowBook {
    pub(crate) fn new() -> Self {
        Self {
            inner: Mutex::new(Book {
                windows: HashMap::new(),
            }),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Book> {
        self.inner.lock().expect("window index lock poisoned")
    }

    /// 按当前环重建索引，并返回要画的那一页。
    pub(crate) fn bind(&self, spec: LogWindowBind, ring: &RingBuffer) -> LogPage {
        let mut hits = VecDeque::new();
        let mut signals = 0u32;
        ring.for_each_from(spec.from_seq, |line| {
            if !log_filter_matches(&spec.filter, line) {
                return;
            }
            let signal = scan_signal(line).is_some();
            if signal {
                signals = signals.saturating_add(1);
            }
            hits.push_back(IndexedHit {
                seq: line.seq,
                signal,
            });
        });
        let mut book = self.lock();
        book.windows.insert(
            spec.id,
            Window {
                id: spec.id,
                serial: spec.serial.clone(),
                filter: spec.filter,
                from_seq: spec.from_seq,
                following: spec.following,
                through_seq: spec.through_seq,
                hits,
                signals,
            },
        );
        let window = book.windows.get(&spec.id).expect("just inserted");
        page_of(window, ring, None)
    }

    pub(crate) fn release(&self, id: u64) {
        self.lock().windows.remove(&id);
    }

    /// 环清空时丢掉序号，登记还在。
    pub(crate) fn clear_serial(&self, serial: &str) {
        for window in self.lock().windows.values_mut() {
            if window.serial == serial {
                window.hits.clear();
                window.signals = 0;
            }
        }
    }

    pub(crate) fn serial_of(&self, id: u64) -> Option<String> {
        self.lock().windows.get(&id).map(|window| window.serial.clone())
    }

    pub(crate) fn latch(&self, id: u64, following: bool, ring: &RingBuffer) -> Option<LogPage> {
        let mut book = self.lock();
        let window = book.windows.get_mut(&id)?;
        window.following = following;
        if following {
            window.through_seq = None;
        }
        let window = book.windows.get(&id)?;
        Some(page_of(window, ring, None))
    }

    pub(crate) fn page(&self, id: u64, index: u64, count: u32, ring: &RingBuffer) -> Option<LogPage> {
        let book = self.lock();
        let window = book.windows.get(&id)?;
        Some(page_of(window, ring, Some((index, count))))
    }

    /// 过滤发生在行进入环之前，只记下哪些窗口要这条。
    pub(crate) fn prepare(&self, serial: &str, line: &LogLine) -> Prepared {
        let book = self.lock();
        let mut hits = Vec::new();
        for window in book.windows.values() {
            if window.serial != serial {
                continue;
            }
            if !log_filter_matches(&window.filter, line) {
                continue;
            }
            hits.push(PreparedHit {
                window_id: window.id,
            });
        }
        Prepared {
            signal: scan_signal(line).is_some(),
            hits,
        }
    }

    /// 序号已经分配。裁掉被环淘汰的命中，再追加这条。
    pub(crate) fn commit(
        &self,
        serial: &str,
        seq: u64,
        oldest: u64,
        prepared: Prepared,
        wire: Option<LogLine>,
    ) -> Vec<HitNote> {
        let mut book = self.lock();
        evict_before(&mut book, serial, oldest);
        let mut notes = Vec::with_capacity(prepared.hits.len());
        for hit in prepared.hits {
            let Some(window) = book.windows.get_mut(&hit.window_id) else {
                continue;
            };
            if window.serial != serial || seq < window.from_seq {
                continue;
            }
            window.hits.push_back(IndexedHit {
                seq,
                signal: prepared.signal,
            });
            if prepared.signal {
                window.signals = window.signals.saturating_add(1);
            }
            let total = window.hits.len() as u64;
            let signals = window.signals;
            let line = wire.clone();
            notes.push(HitNote {
                window_id: hit.window_id,
                total,
                signals,
                line,
            });
        }
        notes
    }
}

fn evict_before(book: &mut Book, serial: &str, oldest: u64) {
    for window in book.windows.values_mut() {
        if window.serial != serial {
            continue;
        }
        while window
            .hits
            .front()
            .is_some_and(|hit| hit.seq < oldest)
        {
            let hit = window.hits.pop_front().expect("front checked");
            if hit.signal {
                window.signals = window.signals.saturating_sub(1);
            }
        }
    }
}

fn view_end(window: &Window) -> usize {
    if window.following {
        return window.hits.len();
    }
    if let Some(through) = window.through_seq {
        return window
            .hits
            .iter()
            .position(|hit| hit.seq > through)
            .unwrap_or(window.hits.len());
    }
    window.hits.len()
}

fn page_of(window: &Window, ring: &RingBuffer, at: Option<(u64, u32)>) -> LogPage {
    let total = window.hits.len() as u64;
    let end = view_end(window);
    let pending = (window.hits.len() - end) as u32;
    // 显式 `log.page` 按请求的行数取。登记与跟尾闩不带下标，返回视口内的全部命中，界面文档一次装入。
    let count = at.map(|(_, count)| count.max(1)).unwrap_or(u32::MAX) as usize;
    let start = if let Some((index, _)) = at {
        (index as usize).min(window.hits.len())
    } else {
        end.saturating_sub(count)
    };
    let stop = if at.is_some() {
        (start + count).min(window.hits.len())
    } else {
        end
    };
    let seqs: Vec<u64> = window.hits.iter().skip(start).take(stop.saturating_sub(start)).map(|hit| hit.seq).collect();
    let lines = ring.lines_by_seq(&seqs);
    LogPage {
        window_id: window.id,
        serial: window.serial.clone(),
        index: start as u64,
        total,
        signals: window.signals,
        pending,
        lines,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use yohu_protocol::{LogLine, LOG_PAGE_LINES};

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
                following: true,
                through_seq: None,
            },
            ring,
        )
    }

    #[test]
    fn bind_keeps_matches_and_signal_then_page_is_tail() {
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
                following: true,
                through_seq: None,
            },
            &ring,
        );
        assert_eq!(page.total, 1);
        assert_eq!(page.signals, 1);
        assert_eq!(page.lines.len(), 1);
        assert_eq!(page.lines[0].msg, "FATAL EXCEPTION: main");
    }

    #[test]
    fn commit_moves_seq_and_evict_drops_signal() {
        let ring = RingBuffer::new(2);
        let book = WindowBook::new();
        let _ = bind_all(&book, &ring, 1);
        let first = line("FATAL EXCEPTION: main", 'E');
        let prepared = book.prepare("S", &first);
        let pushed = ring.push(first);
        let notes = book.commit("S", pushed.seq, pushed.oldest, prepared, None);
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].signals, 1);

        let second = line("mid", 'I');
        let prepared = book.prepare("S", &second);
        let pushed = ring.push(second);
        let _ = book.commit("S", pushed.seq, pushed.oldest, prepared, None);

        let third = line("tail", 'I');
        let prepared = book.prepare("S", &third);
        let pushed = ring.push(third);
        let notes = book.commit("S", pushed.seq, pushed.oldest, prepared, None);
        assert_eq!(notes[0].total, 2);
        assert_eq!(notes[0].signals, 0, "裁出环的崩溃不再计数");
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
            let notes = book.commit("S", pushed.seq, pushed.oldest, prepared, None);
            last_total = notes[0].total;
        }
        assert_eq!(last_total, 8);
        assert_eq!(ring.len(), 8);
    }

    /// 默认环 10 万条灌满后，再写入只动命中尾部，页仍是 `LOG_PAGE_LINES`。
    #[test]
    fn stress_default_capacity_stays_on_the_page() {
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
            let wire = if prepared.needs_body() {
                ring.lines_by_seq(&[pushed.seq]).into_iter().next()
            } else {
                None
            };
            let _ = book.commit("S", pushed.seq, pushed.oldest, prepared, wire);
        }
        let fill = fill_started.elapsed();
        let steady_started = std::time::Instant::now();
        let mut last_total = 0u64;
        for i in 0..STEADY {
            let row = line(&format!("tail {i}"), 'I');
            let prepared = book.prepare("S", &row);
            let pushed = ring.push(row);
            let wire = ring.lines_by_seq(&[pushed.seq]).into_iter().next();
            let notes = book.commit("S", pushed.seq, pushed.oldest, prepared, wire);
            last_total = notes[0].total;
        }
        let steady = steady_started.elapsed();
        let page = book
            .page(1, last_total.saturating_sub(u64::from(LOG_PAGE_LINES)), LOG_PAGE_LINES, &ring)
            .expect("page");
        eprintln!(
            "log stress cap={CAP} fill={fill:?} steady_{STEADY}={steady:?} page={}",
            page.lines.len()
        );
        assert_eq!(ring.len(), CAP);
        assert_eq!(last_total, CAP as u64);
        assert_eq!(page.lines.len(), LOG_PAGE_LINES as usize);
        let fill_ns = fill.as_nanos() / CAP as u128;
        let steady_ns = steady.as_nanos() / STEADY as u128;
        assert!(
            steady_ns < fill_ns.saturating_mul(8).max(1),
            "环满后单行耗时不应随容量爬升: fill {fill_ns}ns steady {steady_ns}ns"
        );
        let (fill_limit, steady_limit) = if cfg!(debug_assertions) {
            (std::time::Duration::from_secs(120), std::time::Duration::from_secs(15))
        } else {
            (std::time::Duration::from_secs(12), std::time::Duration::from_millis(800))
        };
        assert!(fill < fill_limit, "灌满 10 万行超出预算: {fill:?}");
        assert!(
            steady < steady_limit,
            "环满后 {STEADY} 行超出预算: {steady:?}"
        );
    }

    #[test]
    fn detached_window_still_receives_body() {
        let ring = RingBuffer::new(4);
        let book = WindowBook::new();
        let _ = book.bind(
            LogWindowBind {
                id: 1,
                serial: "S".into(),
                filter: LogFilter::default(),
                from_seq: 0,
                following: false,
                through_seq: None,
            },
            &ring,
        );
        let row = line("x", 'I');
        let prepared = book.prepare("S", &row);
        assert!(prepared.needs_body());
    }

    #[test]
    fn through_seq_page_excludes_later_hits() {
        let ring = RingBuffer::new(10);
        ring.push(line("a", 'I'));
        ring.push(line("b", 'I'));
        ring.push(line("c", 'I'));
        let book = WindowBook::new();
        let page = book.bind(
            LogWindowBind {
                id: 3,
                serial: "S".into(),
                filter: LogFilter::default(),
                from_seq: 0,
                following: false,
                through_seq: Some(1),
            },
            &ring,
        );
        assert_eq!(page.lines.len(), 2);
        assert_eq!(page.pending, 1);
        assert_eq!(page.total, 3);
    }
}
