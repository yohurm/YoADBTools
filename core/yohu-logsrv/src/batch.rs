//! 批量器（ADR-v6-007 / ADR-v6-041）：窗口命中聚合后成批推送，**禁逐条**。
//!
//! 聚合策略：定时 100–200ms 或满 `max_lines` 条，先到先发。
//! 字节预算 `max_bytes` 是**实测**上限：发送前按 `serde_json` 的实际序列化长度校验，
//! 超预算的批次按窗口内命中对半切分成多条事件（每批仍 ≤ `max_lines` / ≤ `max_bytes`）。
//! 不做字节估算——估算会把「声明 512KB」变成「实现按猜测」。
//!
//! 背压策略：下游事件队列有界（try_send）——溢出时**丢推送不丢环**，
//! 计数经 `LogOverflow` 事件告知 UI，由 `log.window.bind` 重建当前窗口快照。
//!
//! 信号计数不在本层：界面按可见行派生，core 不维护第二份。

use std::collections::BTreeMap;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yohu_protocol::{AppEvent, LogHits, LogLine};

use crate::limits::HIT_CHANNEL_CAP;

/// 一条已入索引的命中。`line` 只在窗口钉底时才有正文。
pub(crate) struct HitNote {
    pub window_id: u64,
    pub total: u64,
    pub line: Option<LogLine>,
}

struct Acc {
    total: u64,
    tail: Vec<LogLine>,
}

/// ADR-v6-007：定时 100–200ms 内取 150ms。
pub(crate) const BATCH_FLUSH_INTERVAL: Duration = Duration::from_millis(150);
pub(crate) const BATCH_MAX_LINES: usize = 1000;
pub(crate) const BATCH_MAX_BYTES: usize = 512 * 1024;

/// 批量器句柄（feed 一条 logd 记录）。Clone 给各次跟流 attempt；聚合环属代际。
#[derive(Clone)]
pub(crate) struct Batcher {
    line_tx: mpsc::Sender<HitNote>,
}

impl Batcher {
    /// 启动聚合循环；返回句柄与 JoinHandle。
    pub(crate) fn spawn(
        serial: String,
        sink: mpsc::Sender<AppEvent>,
        flush_interval: Duration,
        max_lines: usize,
        max_bytes: usize,
        cancel: CancellationToken,
    ) -> (Self, tokio::task::JoinHandle<()>) {
        let (line_tx, line_rx) = mpsc::channel::<HitNote>(HIT_CHANNEL_CAP);
        let handle = tokio::spawn(aggregate_loop(
            serial,
            line_rx,
            sink,
            flush_interval,
            max_lines,
            max_bytes,
            cancel,
        ));
        (Self { line_tx }, handle)
    }

    /// 送入一条窗口命中（异步背压：聚合环消费快于生产，正常不阻塞）。
    pub(crate) async fn note(&self, note: HitNote) -> Result<(), ()> {
        self.line_tx.send(note).await.map_err(|_| ())
    }
}

async fn aggregate_loop(
    serial: String,
    mut line_rx: mpsc::Receiver<HitNote>,
    sink: mpsc::Sender<AppEvent>,
    flush_interval: Duration,
    max_lines: usize,
    max_bytes: usize,
    cancel: CancellationToken,
) {
    let mut interval = tokio::time::interval(flush_interval);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    // 有序：同一批内跨窗口的事件顺序可复现（排障与测试需要确定性）。
    let mut pending: BTreeMap<u64, Acc> = BTreeMap::new();
    let mut pending_lines: usize = 0;
    let mut dropped_batches: u64 = 0;

    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                // 取消：不再推送（UI 已随停止处理，缓冲可重放）
                break;
            }
            note = line_rx.recv() => {
                let Some(note) = note else {
                    // 生产端结束：冲刷剩余命中，避免尾部批次丢失
                    if !pending.is_empty() {
                        flush(&mut pending, &mut pending_lines, &serial, &sink, max_bytes, &mut dropped_batches);
                    }
                    break;
                };
                let acc = pending.entry(note.window_id).or_insert(Acc {
                    total: note.total,
                    tail: Vec::new(),
                });
                acc.total = note.total;
                if let Some(row) = note.line {
                    acc.tail.push(row);
                }
                pending_lines += 1;
                if pending_lines >= max_lines {
                    flush(&mut pending, &mut pending_lines, &serial, &sink, max_bytes, &mut dropped_batches);
                }
            }
            _ = interval.tick() => {
                if !pending.is_empty() {
                    flush(&mut pending, &mut pending_lines, &serial, &sink, max_bytes, &mut dropped_batches);
                } else if dropped_batches > 0 {
                    emit_overflow(&sink, &serial, &mut dropped_batches);
                }
            }
        }
    }
}

fn flush(
    pending: &mut BTreeMap<u64, Acc>,
    pending_lines: &mut usize,
    serial: &str,
    sink: &mpsc::Sender<AppEvent>,
    max_bytes: usize,
    dropped_batches: &mut u64,
) {
    let ready = std::mem::take(pending);
    *pending_lines = 0;
    for (window_id, acc) in ready {
        emit_window(sink, serial, window_id, acc, max_bytes, dropped_batches);
    }
}

/// 发一个窗口的这批命中。整批超出字节预算时按命中对半切，保证每条事件都 ≤ `max_bytes`。
fn emit_window(
    sink: &mpsc::Sender<AppEvent>,
    serial: &str,
    window_id: u64,
    acc: Acc,
    max_bytes: usize,
    dropped_batches: &mut u64,
) {
    let total = acc.total;
    let mut rest = acc.tail;
    while !rest.is_empty() {
        // 二分出「能塞进预算的最长前缀」；至少发 1 条，避免单条超大命中死循环。
        let mut take = rest.len();
        while take > 1 {
            let event = hits_event(serial, window_id, total, &rest[..take]);
            if wire_len(&event) <= max_bytes {
                break;
            }
            take /= 2;
        }
        let tail: Vec<LogLine> = rest.drain(..take).collect();
        let event = hits_event(serial, window_id, total, &tail);
        push(sink, event, serial, dropped_batches);
    }
    // 命中数为 0 的批次不产生事件（没有正文也没有计数变化）。
}

fn hits_event(serial: &str, window_id: u64, total: u64, tail: &[LogLine]) -> AppEvent {
    AppEvent::LogHits(LogHits {
        serial: serial.to_string(),
        window_id,
        total,
        appended: tail.len() as u32,
        tail: tail.to_vec(),
    })
}

/// 一次事件的**实际**序列化长度。`AppEvent` 全字段是字符串/数字/数组，序列化不会失败；
/// 万一失败按 0 计（预算判定失效但数据不丢，`try_send` 仍是真正的闸门）。
fn wire_len(event: &AppEvent) -> usize {
    serde_json::to_vec(event).map(|bytes| bytes.len()).unwrap_or(0)
}

fn push(
    sink: &mpsc::Sender<AppEvent>,
    event: AppEvent,
    serial: &str,
    dropped_batches: &mut u64,
) {
    match sink.try_send(event) {
        Ok(()) => {
            if *dropped_batches > 0 {
                emit_overflow(sink, serial, dropped_batches);
            }
        }
        Err(mpsc::error::TrySendError::Full(_)) => {
            // 丢推送不丢环：索引与环仍持有命中，UI 经 log.window.bind 重建当前窗口快照
            *dropped_batches += 1;
        }
        Err(mpsc::error::TrySendError::Closed(_)) => {}
    }
}

fn emit_overflow(sink: &mpsc::Sender<AppEvent>, serial: &str, dropped: &mut u64) {
    if *dropped == 0 {
        return;
    }
    let event = AppEvent::LogOverflow {
        serial: serial.to_string(),
        dropped_batches: *dropped,
    };
    if sink.try_send(event).is_ok() {
        *dropped = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(i: u64) -> HitNote {
        HitNote {
            window_id: 1,
            total: i + 1,
            line: Some(LogLine {
                seq: i,
                ts: "2026-01-01 00:00:00.000".into(),
                pid: 1,
                tid: 1,
                level: 'I',
                tag: "T".into(),
                msg: format!("line {i}"),
                ..LogLine::default()
            }),
        }
    }

    fn note_for(window_id: u64, seq: u64) -> HitNote {
        HitNote {
            window_id,
            total: seq + 1,
            line: Some(LogLine {
                seq,
                ts: "2026-01-01 00:00:00.000".into(),
                pid: 1,
                tid: 1,
                level: 'I',
                tag: "T".into(),
                msg: format!("line {seq}"),
                ..LogLine::default()
            }),
        }
    }

    #[tokio::test]
    async fn aggregates_by_timer() {
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(16);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            Duration::from_millis(10),
            BATCH_MAX_LINES,
            BATCH_MAX_BYTES,
            CancellationToken::new(),
        );
        batcher.note(note(0)).await.unwrap();
        batcher.note(note(1)).await.unwrap();

        let event = tokio::time::timeout(Duration::from_secs(2), sink_rx.recv())
            .await
            .expect("聚合超时")
            .expect("channel closed");
        match event {
            AppEvent::LogHits(hits) => {
                assert_eq!(hits.window_id, 1);
                assert_eq!(hits.tail.len(), 2);
                assert_eq!(hits.appended, 2);
            }
            other => panic!("unexpected event: {other:?}"),
        }
        drop(batcher);
        let _ = handle.await;
    }

    #[tokio::test]
    async fn flushes_early_on_line_threshold() {
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(16);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            Duration::from_secs(60),
            3, // 阈值 3 条
            BATCH_MAX_BYTES,
            CancellationToken::new(),
        );
        for i in 0..3 {
            batcher.note(note(i)).await.unwrap();
        }
        let event = tokio::time::timeout(Duration::from_secs(2), sink_rx.recv())
            .await
            .expect("条数阈值未触发")
            .expect("channel closed");
        match event {
            AppEvent::LogHits(hits) => assert_eq!(hits.tail.len(), 3),
            other => panic!("unexpected event: {other:?}"),
        }
        drop(batcher);
        let _ = handle.await;
    }

    #[tokio::test]
    async fn overflow_drops_push_but_reports() {
        // 下游容量 1：批量器将持续溢出，随后应收到 LogOverflow 计数
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(1);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            Duration::from_millis(10),
            2,
            BATCH_MAX_BYTES,
            CancellationToken::new(),
        );
        // 喂 6 条 → 3 批；下游只取 1 批 → 2 批溢出
        for i in 0..6 {
            batcher.note(note(i)).await.unwrap();
        }
        let mut saw_batch = false;
        let mut saw_overflow = false;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        while tokio::time::Instant::now() < deadline && !(saw_batch && saw_overflow) {
            match sink_rx.recv().await {
                Some(AppEvent::LogHits(_)) => saw_batch = true,
                Some(AppEvent::LogOverflow {
                    dropped_batches, ..
                }) => {
                    assert!(dropped_batches > 0);
                    saw_overflow = true;
                }
                _ => {}
            }
        }
        assert!(saw_batch, "应有至少一批成功推送");
        assert!(saw_overflow, "溢出必须被计数上报");
        drop(batcher);
        let _ = handle.await;
    }

    /// 同一批内跨窗口的事件顺序确定（按 window_id 升序），可复现。
    #[tokio::test]
    async fn cross_window_order_is_deterministic() {
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(32);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            Duration::from_secs(60),
            4,
            BATCH_MAX_BYTES,
            CancellationToken::new(),
        );
        // 交错喂入三个窗口，故意乱序
        for (window_id, seq) in [(3u64, 0u64), (1, 1), (2, 2), (1, 3)] {
            batcher.note(note_for(window_id, seq)).await.unwrap();
        }
        let event = tokio::time::timeout(Duration::from_secs(2), sink_rx.recv())
            .await
            .expect("阈值未触发")
            .expect("channel closed");
        drop(batcher);
        let _ = handle.await;

        let mut order = Vec::new();
        match event {
            AppEvent::LogHits(hits) => order.push(hits.window_id),
            other => panic!("unexpected event: {other:?}"),
        }
        while let Ok(AppEvent::LogHits(hits)) = sink_rx.try_recv() {
            order.push(hits.window_id);
        }
        assert_eq!(order, vec![1, 2, 3], "跨窗口顺序必须按 window_id 升序");
    }

    /// 字节预算实测：1000 条大消息的整批必须被切成多条事件，每条序列化后 ≤ 预算，
    /// 且切分不丢行、不改 `total`。这是「声明 512KB」与「实现」之间唯一可判定的桥。
    #[tokio::test]
    async fn byte_budget_is_measured_and_split() {
        const MSG_BYTES: usize = 2_048;
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(256);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            Duration::from_secs(60),
            BATCH_MAX_LINES,
            BATCH_MAX_BYTES,
            CancellationToken::new(),
        );
        let msg = "x".repeat(MSG_BYTES);
        for i in 0..BATCH_MAX_LINES as u64 {
            batcher.note(HitNote {
                window_id: 1,
                total: i + 1,
                line: Some(LogLine {
                    seq: i,
                    ts: "2026-01-01 00:00:00.000".into(),
                    pid: 1,
                    tid: 1,
                    level: 'I',
                    tag: "Big".into(),
                    msg: msg.clone(),
                    ..LogLine::default()
                }),
            })
            .await
            .unwrap();
        }
        drop(batcher);
        let _ = handle.await;

        let mut events = 0usize;
        let mut lines = 0usize;
        let mut totals = Vec::new();
        while let Ok(event) = sink_rx.try_recv() {
            if let AppEvent::LogHits(hits) = &event {
                events += 1;
                lines += hits.tail.len();
                totals.push(hits.total);
                assert_eq!(
                    hits.appended as usize,
                    hits.tail.len(),
                    "appended 必须等于这批实际正文条数"
                );
                let bytes = serde_json::to_vec(&event).expect("serialize");
                assert!(
                    bytes.len() <= BATCH_MAX_BYTES,
                    "单批序列化 {} 字节超出预算 {BATCH_MAX_BYTES}",
                    bytes.len()
                );
            }
        }
        assert_eq!(lines, BATCH_MAX_LINES, "切分不得丢行");
        assert!(events > 1, "大消息整批必然超出预算，必须被切分");
        assert!(
            totals.iter().all(|t| *t == BATCH_MAX_LINES as u64),
            "切分不改变 total（它是窗口命中总数）"
        );
    }

    /// 性能回归（架构文档 §12 自动化子集）：50k 条 → 50 批（每批 1000），
    /// 零丢条且聚合耗时满足 ADR-v6-007 批量预算（16ms/批；debug 构建留 2.5x 余量）。
    #[tokio::test]
    async fn perf_50k_lines_within_batch_budget() {
        const TOTAL: u64 = 50_000;
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(64);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            BATCH_FLUSH_INTERVAL,
            BATCH_MAX_LINES,
            BATCH_MAX_BYTES,
            CancellationToken::new(),
        );
        let started = std::time::Instant::now();
        for i in 0..TOTAL {
            batcher.note(note(i)).await.unwrap();
        }
        drop(batcher);
        let _ = handle.await;
        let elapsed = started.elapsed();

        let mut batches = 0u32;
        let mut lines = 0usize;
        while let Ok(event) = sink_rx.try_recv() {
            if let AppEvent::LogHits(hits) = event {
                batches += 1;
                lines += hits.tail.len();
            }
        }
        assert_eq!(
            batches,
            (TOTAL as usize / BATCH_MAX_LINES) as u32,
            "50k 条应恰好按 BATCH_MAX_LINES 切批"
        );
        assert_eq!(lines, TOTAL as usize, "零丢条");
        assert!(
            elapsed.as_millis() < 2000,
            "50 批聚合耗时超预算（16ms/批 → 800ms，余量 2.5x）: {elapsed:?}"
        );
    }
}
