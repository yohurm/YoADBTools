//! 跟流泵：`adb logcat -v long,uid,year` → `MessageAssembler` → 入环 → 批量器。
//!
//! 格式修饰对齐 AOSP `FORMAT_LONG` + `uid` + `year`。
//! 组装对照 AS `LogcatServiceImpl.readLogcatText` + `LogcatMessageAssembler`：
//! 下一条头结束上一条；批末空闲 100ms flush 最后一条；流结束再 take 一次。

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::assembler::MessageAssembler;
use crate::batch::Batcher;
use crate::ring::RingBuffer;
use crate::task::AbortOnDrop;
use yohu_adb::AdbClient;
use yohu_protocol::LogLine;

const LOGCAT_FORMAT: &str = "long,uid,year";
const LAST_MESSAGE_DELAY: Duration = Duration::from_millis(100);

fn follow_argv() -> Vec<String> {
    vec!["logcat".into(), "-v".into(), LOGCAT_FORMAT.into()]
}

async fn emit(ring: &RingBuffer, batcher: &Batcher, mut line: LogLine) -> Result<(), ()> {
    line.seq = ring.push(line.clone());
    batcher.feed(line).await.map_err(|_| ())
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
        let mut assembler = MessageAssembler::new();
        loop {
            tokio::select! {
                raw = line_rx.recv() => {
                    let Some(raw) = raw else {
                        break;
                    };
                    for line in assembler.ingest(&raw) {
                        if emit(&ring, &batcher, line).await.is_err() {
                            return;
                        }
                    }
                }
                _ = tokio::time::sleep(LAST_MESSAGE_DELAY), if assembler.has_pending() => {
                    if let Some(line) = assembler.take() {
                        if emit(&ring, &batcher, line).await.is_err() {
                            return;
                        }
                    }
                }
            }
        }
        if let Some(line) = assembler.take() {
            let _ = emit(&ring, &batcher, line).await;
        }
    }));

    let _ = adb
        .stream_lines(&serial, &follow_argv(), cancel.clone(), line_tx.clone())
        .await;

    drop(line_tx);
    pump.join().await;
}
