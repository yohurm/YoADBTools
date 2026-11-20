//! 命中水位聚合器（ADR-v6-049）：窗口命中聚合成**不含正文的水位信号** `log/hits`。
//!
//! 对齐 Android Studio Logcat：环缓冲是数据源，界面按 seq 游标自己从环拉取；
//! 这里只负责把「有新命中到 seq X」以 100–200ms 聚合后作为**信号**推送。
//! 推送丢失只影响延迟（下一次水位更高即可一次性补齐），不影响正确性。
//!
//! 背压：下游事件队列有界（try_send）——溢出丢信号不丢环，界面下一次水位或兜底 tick 仍能追上。

use std::collections::BTreeMap;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yohu_protocol::{AppEvent, LogHits};

use crate::limits::HIT_CHANNEL_CAP;

/// 一条窗口命中（只有序号，无正文）。
pub(crate) struct HitNote {
    pub window_id: u64,
    pub total: u64,
    pub seq: u64,
}

struct Acc {
    total: u64,
    appended: u32,
    last_seq: u64,
}

/// ADR-v6-007：定时 100–200ms 内取 150ms。
pub(crate) const BATCH_FLUSH_INTERVAL: Duration = Duration::from_millis(150);
pub(crate) const BATCH_MAX_LINES: usize = 1000;

/// 批量器句柄（feed 一条命中序号）。Clone 给各次跟流 attempt；聚合环属代际。
#[derive(Clone)]
pub(crate) struct Batcher {
    line_tx: mpsc::Sender<HitNote>,
}

impl Batcher {
    pub(crate) fn spawn(
        serial: String,
        sink: mpsc::Sender<AppEvent>,
        flush_interval: Duration,
        max_lines: usize,
        cancel: CancellationToken,
    ) -> (Self, tokio::task::JoinHandle<()>) {
        let (line_tx, line_rx) = mpsc::channel::<HitNote>(HIT_CHANNEL_CAP);
        let handle = tokio::spawn(aggregate_loop(
            serial,
            line_rx,
            sink,
            flush_interval,
            max_lines,
            cancel,
        ));
        (Self { line_tx }, handle)
    }

    /// 送入一条窗口命中序号（异步背压：聚合环消费快于生产，正常不阻塞）。
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
    cancel: CancellationToken,
) {
    let mut interval = tokio::time::interval(flush_interval);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    // 有序：同一批内跨窗口信号顺序可复现。
    let mut pending: BTreeMap<u64, Acc> = BTreeMap::new();
    let mut pending_lines: usize = 0;

    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => break,
            note = line_rx.recv() => {
                let Some(note) = note else {
                    if !pending.is_empty() {
                        flush(&mut pending, &mut pending_lines, &serial, &sink);
                    }
                    break;
                };
                let acc = pending.entry(note.window_id).or_insert(Acc {
                    total: note.total,
                    appended: 0,
                    last_seq: note.seq,
                });
                acc.total = note.total;
                acc.appended += 1;
                acc.last_seq = note.seq;
                pending_lines += 1;
                if pending_lines >= max_lines {
                    flush(&mut pending, &mut pending_lines, &serial, &sink);
                }
            }
            _ = interval.tick() => {
                if !pending.is_empty() {
                    flush(&mut pending, &mut pending_lines, &serial, &sink);
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
) {
    let ready = std::mem::take(pending);
    *pending_lines = 0;
    for (window_id, acc) in ready {
        if acc.appended == 0 {
            continue;
        }
        let event = AppEvent::LogHits(LogHits {
            serial: serial.to_string(),
            window_id,
            total: acc.total,
            appended: acc.appended,
            last_seq: acc.last_seq,
        });
        // 丢信号不丢环：下一次水位更高即可补齐（无需 overflow 恢复事件）。
        let _ = sink.try_send(event);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(window_id: u64, seq: u64) -> HitNote {
        HitNote {
            window_id,
            total: seq + 1,
            seq,
        }
    }

    #[tokio::test]
    async fn aggregates_and_carries_watermark() {
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(16);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            Duration::from_millis(10),
            BATCH_MAX_LINES,
            CancellationToken::new(),
        );
        batcher.note(note(1, 0)).await.unwrap();
        batcher.note(note(1, 1)).await.unwrap();
        let event = tokio::time::timeout(Duration::from_secs(2), sink_rx.recv())
            .await
            .expect("聚合超时")
            .expect("channel closed");
        match event {
            AppEvent::LogHits(hits) => {
                assert_eq!(hits.window_id, 1);
                assert_eq!(hits.appended, 2);
                assert_eq!(hits.total, 2);
                assert_eq!(hits.last_seq, 1, "水位必须是本批最后一条命中 seq");
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
            3,
            CancellationToken::new(),
        );
        for i in 0..3 {
            batcher.note(note(1, i)).await.unwrap();
        }
        let event = tokio::time::timeout(Duration::from_secs(2), sink_rx.recv())
            .await
            .expect("条数阈值未触发")
            .expect("channel closed");
        match event {
            AppEvent::LogHits(hits) => assert_eq!(hits.appended, 3),
            other => panic!("unexpected event: {other:?}"),
        }
        drop(batcher);
        let _ = handle.await;
    }

    #[tokio::test]
    async fn cross_window_order_is_deterministic() {
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(32);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            Duration::from_secs(60),
            4,
            CancellationToken::new(),
        );
        for (window_id, seq) in [(3u64, 0u64), (1, 1), (2, 2), (1, 3)] {
            batcher.note(note(window_id, seq)).await.unwrap();
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

    /// 性能回归：50k 命中 → 50 批（每批 1000），零丢信号。
    #[tokio::test]
    async fn perf_50k_signals_within_budget() {
        const TOTAL: u64 = 50_000;
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(64);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            BATCH_FLUSH_INTERVAL,
            BATCH_MAX_LINES,
            CancellationToken::new(),
        );
        let started = std::time::Instant::now();
        for i in 0..TOTAL {
            batcher.note(note(1, i)).await.unwrap();
        }
        drop(batcher);
        let _ = handle.await;
        let elapsed = started.elapsed();

        let mut batches = 0u32;
        let mut appended = 0usize;
        while let Ok(event) = sink_rx.try_recv() {
            if let AppEvent::LogHits(hits) = event {
                batches += 1;
                appended += hits.appended as usize;
            }
        }
        assert_eq!(
            batches,
            (TOTAL as usize / BATCH_MAX_LINES) as u32,
            "50k 应按 BATCH_MAX_LINES 切批"
        );
        assert_eq!(appended, TOTAL as usize, "零丢信号");
        assert!(
            elapsed.as_millis() < 2000,
            "50 批聚合超预算: {elapsed:?}"
        );
    }
}
