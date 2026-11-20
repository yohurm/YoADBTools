//! 设备环水位聚合器（ADR-v6-049）：把「环前进到 seq」以 100–200ms 聚合后作为
//! **不含正文的水位信号** `log/appended` 推送。环形缓冲是唯一数据源，UI 按 seq 游标
//! 从环拉取；推送丢失只影响延迟（下一次水位更高即可补齐），不影响正确性。
//!
//! 背压：下游事件队列有界（try_send）——丢信号不丢环。

use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yohu_protocol::{AppEvent, LogAppended};

use crate::limits::HIT_CHANNEL_CAP;

/// ADR-v6-007：定时 100–200ms 内取 150ms。
pub(crate) const BATCH_FLUSH_INTERVAL: Duration = Duration::from_millis(150);
pub(crate) const BATCH_MAX_LINES: usize = 1000;

/// 水位聚合器句柄（feed 一条入环 seq）。
#[derive(Clone)]
pub(crate) struct Batcher {
    seq_tx: mpsc::Sender<u64>,
}

impl Batcher {
    pub(crate) fn spawn(
        serial: String,
        sink: mpsc::Sender<AppEvent>,
        flush_interval: Duration,
        max_lines: usize,
        cancel: CancellationToken,
    ) -> (Self, tokio::task::JoinHandle<()>) {
        let (seq_tx, seq_rx) = mpsc::channel::<u64>(HIT_CHANNEL_CAP);
        let handle = tokio::spawn(aggregate_loop(
            serial,
            seq_rx,
            sink,
            flush_interval,
            max_lines,
            cancel,
        ));
        (Self { seq_tx }, handle)
    }

    pub(crate) async fn note(&self, seq: u64) -> Result<(), ()> {
        self.seq_tx.send(seq).await.map_err(|_| ())
    }
}

async fn aggregate_loop(
    serial: String,
    mut seq_rx: mpsc::Receiver<u64>,
    sink: mpsc::Sender<AppEvent>,
    flush_interval: Duration,
    max_lines: usize,
    cancel: CancellationToken,
) {
    let mut interval = tokio::time::interval(flush_interval);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut pending_last: Option<u64> = None;
    let mut pending_count: usize = 0;

    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => break,
            seq = seq_rx.recv() => {
                let Some(seq) = seq else {
                    if let Some(last) = pending_last {
                        emit(&sink, &serial, last);
                    }
                    break;
                };
                pending_last = Some(match pending_last {
                    Some(prev) => prev.max(seq),
                    None => seq,
                });
                pending_count += 1;
                if pending_count >= max_lines {
                    if let Some(last) = pending_last.take() {
                        emit(&sink, &serial, last);
                    }
                    pending_count = 0;
                }
            }
            _ = interval.tick() => {
                if let Some(last) = pending_last.take() {
                    emit(&sink, &serial, last);
                }
                pending_count = 0;
            }
        }
    }
}

fn emit(sink: &mpsc::Sender<AppEvent>, serial: &str, last_seq: u64) {
    // 丢信号不丢环：下一次水位更高即可补齐（无需 overflow 恢复事件）。
    let _ = sink.try_send(AppEvent::LogAppended(LogAppended {
        serial: serial.to_string(),
        last_seq,
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn aggregates_to_one_watermark() {
        let (sink, mut sink_rx) = mpsc::channel::<AppEvent>(16);
        let (batcher, handle) = Batcher::spawn(
            "s1".into(),
            sink,
            Duration::from_millis(10),
            BATCH_MAX_LINES,
            CancellationToken::new(),
        );
        batcher.note(0).await.unwrap();
        batcher.note(1).await.unwrap();
        let event = tokio::time::timeout(Duration::from_secs(2), sink_rx.recv())
            .await
            .expect("聚合超时")
            .expect("channel closed");
        match event {
            AppEvent::LogAppended(a) => {
                assert_eq!(a.serial, "s1");
                assert_eq!(a.last_seq, 1, "水位是本批最大 seq");
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
            batcher.note(i).await.unwrap();
        }
        let event = tokio::time::timeout(Duration::from_secs(2), sink_rx.recv())
            .await
            .expect("条数阈值未触发")
            .expect("channel closed");
        match event {
            AppEvent::LogAppended(a) => assert_eq!(a.last_seq, 2),
            other => panic!("unexpected event: {other:?}"),
        }
        drop(batcher);
        let _ = handle.await;
    }

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
            batcher.note(i).await.unwrap();
        }
        drop(batcher);
        let _ = handle.await;
        let elapsed = started.elapsed();
        let mut batches = 0u32;
        let mut last = 0u64;
        while let Ok(event) = sink_rx.try_recv() {
            if let AppEvent::LogAppended(a) = event {
                batches += 1;
                last = a.last_seq;
            }
        }
        assert_eq!(batches, (TOTAL as usize / BATCH_MAX_LINES) as u32);
        assert_eq!(last, TOTAL - 1, "水位最终追平");
        assert!(elapsed.as_millis() < 2000, "聚合超预算: {elapsed:?}");
    }
}
