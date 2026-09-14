//! 跟流泵：`adb logcat -v threadtime,uid,year` → 解析 → 入环 → 批量器。

use std::sync::Arc;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::batch::Batcher;
use crate::parse::parse_threadtime;
use crate::ring::RingBuffer;
use crate::task::AbortOnDrop;
use yohu_adb::AdbClient;

const LOGCAT_FORMAT: &str = "threadtime,uid,year";

fn follow_argv() -> Vec<String> {
    vec!["logcat".into(), "-v".into(), LOGCAT_FORMAT.into()]
}

pub(crate) async fn run_follow(
    adb: Arc<AdbClient>,
    serial: String,
    ring: Arc<RingBuffer>,
    batcher: Batcher,
    cancel: CancellationToken,
) {
    let (line_tx, mut line_rx) = mpsc::channel::<String>(1024);
    let pump = AbortOnDrop::new(tokio::spawn(async move {
        while let Some(raw) = line_rx.recv().await {
            let Some(mut line) = parse_threadtime(&raw) else {
                continue;
            };
            // 单调 seq 由环分配：让送入批量器/推送链路的行也带上同一 seq，
            // 否则 UI 的 seq 去重/回补锚点全为 0（数据被误判为重复而丢弃）。
            line.seq = ring.push(line.clone());
            if batcher.feed(line).await.is_err() {
                break;
            }
        }
    }));

    let _ = adb
        .stream_lines(&serial, &follow_argv(), cancel.clone(), line_tx.clone())
        .await;

    drop(line_tx);
    pump.join().await;
}
