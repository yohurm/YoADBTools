//! 进程索引服务：采集中周期 `ps` 刷新包名↔PID 映射；点开始时一次性 snapshot。
//!
//! 变更才发事件；失败降级「仅 PID 模式」（degraded 标志）。

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use yohu_adb::{AdbClient, AdbError};
use yohu_protocol::{AppEvent, ProcessEntry, ProcessIndexSnapshot};

/// 采集中进程索引刷新周期。
const INDEX_INTERVAL: Duration = Duration::from_millis(2500);

pub(crate) struct ProcessIndexService {
    adb: Arc<AdbClient>,
    sink: mpsc::Sender<AppEvent>,
}

impl ProcessIndexService {
    pub(crate) fn new(adb: Arc<AdbClient>, sink: mpsc::Sender<AppEvent>) -> Self {
        Self { adb, sink }
    }

    pub(crate) async fn snapshot(
        &self,
        serial: &str,
        cancel: CancellationToken,
    ) -> Result<Vec<ProcessEntry>, AdbError> {
        self.adb.ps(serial, cancel).await
    }

    pub(crate) fn spawn(
        &self,
        serial: String,
        cancel: CancellationToken,
    ) -> tokio::task::JoinHandle<()> {
        let adb = Arc::clone(&self.adb);
        let sink = self.sink.clone();
        tokio::spawn(run_loop(serial, adb, sink, INDEX_INTERVAL, cancel))
    }
}

async fn run_loop(
    serial: String,
    adb: Arc<AdbClient>,
    sink: mpsc::Sender<AppEvent>,
    interval: Duration,
    cancel: CancellationToken,
) {
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut last: Option<Vec<ProcessEntry>> = None;
    let mut degraded_reported = false;

    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => break,
            _ = ticker.tick() => {}
        }
        match adb.ps(&serial, cancel.clone()).await {
            Ok(entries) => {
                if last.as_ref() != Some(&entries) {
                    let _ = sink.try_send(AppEvent::ProcessIndex(ProcessIndexSnapshot {
                        serial: serial.clone(),
                        entries: entries.clone(),
                        degraded: false,
                    }));
                    last = Some(entries);
                }
                degraded_reported = false;
            }
            Err(_) if !degraded_reported => {
                degraded_reported = true;
                let _ = sink.try_send(AppEvent::ProcessIndex(ProcessIndexSnapshot {
                    serial: serial.clone(),
                    entries: Vec::new(),
                    degraded: true,
                }));
            }
            Err(_) => {}
        }
    }
}
