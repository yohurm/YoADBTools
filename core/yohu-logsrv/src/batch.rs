//! 批量器（ADR-v6-007 / ADR-v6-041）：窗口命中聚合后成批推送，**禁逐条**。
//!
//! 聚合策略：定时 100–200ms 或满 `max_lines` 条 / `max_bytes` 字节，先到先发。
//! 背压策略：下游事件队列有界（try_send）——溢出时**丢推送不丢环**，
//! 计数经 `LogOverflow` 事件告知 UI，由 `log.page` 补当前页。

use std::collections::HashMap;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yohu_protocol::{AppEvent, LogHits, LogLine};

/// 一条已入索引的命中。`line` 只在窗口钉底时才有正文。
pub(crate) struct HitNote {
    pub window_id: u64,
    pub total: u64,
    pub signals: u32,
    pub line: Option<LogLine>,
}

struct Acc {
    total: u64,
    signals: u32,
    appended: u32,
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
        let (line_tx, line_rx) = mpsc::channel::<HitNote>(4096);
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

    let mut pending: HashMap<u64, Acc> = HashMap::new();
    let mut pending_bytes: usize = 0;
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
                        flush(&mut pending, &mut pending_bytes, &mut pending_lines, &serial, &sink, &mut dropped_batches);
                    }
                    break;
                };
                let bytes = note.line.as_ref().map(|row| row.msg.len() + row.tag.len() + 32).unwrap_or(16);
                let acc = pending.entry(note.window_id).or_insert(Acc {
                    total: note.total,
                    signals: note.signals,
                    appended: 0,
                    tail: Vec::new(),
                });
                acc.total = note.total;
                acc.signals = note.signals;
                acc.appended = acc.appended.saturating_add(1);
                if let Some(row) = note.line {
                    acc.tail.push(row);
                }
                pending_bytes += bytes;
                pending_lines += 1;
                if pending_lines >= max_lines || pending_bytes >= max_bytes {
                    flush(&mut pending, &mut pending_bytes, &mut pending_lines, &serial, &sink, &mut dropped_batches);
                }
            }
            _ = interval.tick() => {
                if !pending.is_empty() {
                    flush(&mut pending, &mut pending_bytes, &mut pending_lines, &serial, &sink, &mut dropped_batches);
                } else if dropped_batches > 0 {
                    emit_overflow(&sink, &serial, &mut dropped_batches);
                }
            }
        }
    }
}

fn flush(
    pending: &mut HashMap<u64, Acc>,
    pending_bytes: &mut usize,
    pending_lines: &mut usize,
    serial: &str,
    sink: &mpsc::Sender<AppEvent>,
    dropped_batches: &mut u64,
) {
    let ready = std::mem::take(pending);
    *pending_bytes = 0;
    *pending_lines = 0;
    if ready.is_empty() {
        return;
    }
    for (window_id, acc) in ready {
        let event = AppEvent::LogHits(LogHits {
            serial: serial.to_string(),
            window_id,
            total: acc.total,
            appended: acc.appended,
            signals: acc.signals,
            tail: acc.tail,
        });
        match sink.try_send(event) {
            Ok(()) => {
                if *dropped_batches > 0 {
                    emit_overflow(sink, serial, dropped_batches);
                }
            }
            Err(mpsc::error::TrySendError::Full(_)) => {
                // 丢推送不丢环：索引与环仍持有命中，UI 经 log.page 补当前页
                *dropped_batches += 1;
            }
            Err(mpsc::error::TrySendError::Closed(_)) => {}
        }
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
            signals: 0,
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
