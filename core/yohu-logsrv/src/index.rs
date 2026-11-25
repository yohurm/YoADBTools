//! 进程索引服务：采集中周期 `ps` 刷新包名↔PID 映射。
//!
//! 变更才发事件；失败降级「仅 PID 模式」（degraded 标志）。
//!
//! ## 世代与单生产者
//!
//! 快照事件必须带 `generation`：`try_send` 不阻塞，世代 n 的 `ps` 结果可能在世代 n+1
//! 启动后才送达，界面据此「只升不减」丢弃迟到快照（否则包名↔PID 会用上已死 PID 集）。
//!
//! **周期路径是唯一 `ps` 生产者**：首拍延后一个周期（`interval_at`），
//! 由命令层 `log.processSnapshot` 的一次性对账提供首个索引，避免点开始时重复 `ps`。

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

    /// 一次性对账（命令层 `log.processSnapshot` 用）。不是事件源，不发快照。
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
        generation: u64,
        cancel: CancellationToken,
    ) -> tokio::task::JoinHandle<()> {
        let adb = Arc::clone(&self.adb);
        let sink = self.sink.clone();
        tokio::spawn(run_loop(
            serial,
            generation,
            adb,
            sink,
            INDEX_INTERVAL,
            cancel,
        ))
    }
}

async fn run_loop(
    serial: String,
    generation: u64,
    adb: Arc<AdbClient>,
    sink: mpsc::Sender<AppEvent>,
    interval: Duration,
    cancel: CancellationToken,
) {
    // 首拍延后一个周期：首个索引由命令层的一次性对账提供，避免每次开始多跑一次 `ps`。
    let mut ticker = tokio::time::interval_at(tokio::time::Instant::now() + interval, interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    // 最近一次已上报的 (entries, degraded)。成功与失败共用同一变化检测：
    // 失败只上报一次 degraded=true；恢复时即使 entries 与失败前相同也因 degraded 翻回 false 而重报。
    let mut last_reported: Option<(Vec<ProcessEntry>, bool)> = None;

    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => break,
            _ = ticker.tick() => {}
        }
        let (reported, failure) = match adb.ps(&serial, cancel.clone()).await {
            Ok(entries) => ((entries, false), None),
            Err(err) => ((Vec::new(), true), Some(err)),
        };
        if !should_report(&last_reported, &reported) {
            continue;
        }
        if let Some(err) = &failure {
            // 只在降级状态翻转那一次记录原因，避免每拍刷屏；排障有据。
            tracing::warn!(serial = %serial, error = %err, "进程索引刷新失败，降级为仅 PID 模式");
        }
        let _ = sink.try_send(AppEvent::ProcessIndex(ProcessIndexSnapshot {
            serial: serial.clone(),
            generation,
            entries: reported.0.clone(),
            degraded: reported.1,
        }));
        last_reported = Some(reported);
    }
}

/// 是否要把本次刷新上报：内容变化，或降级状态翻转（失败上报一次、恢复上报一次）。
fn should_report(
    last: &Option<(Vec<ProcessEntry>, bool)>,
    current: &(Vec<ProcessEntry>, bool),
) -> bool {
    match last {
        Some((entries, degraded)) => *degraded != current.1 || entries != &current.0,
        None => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entries(names: &[&str]) -> Vec<ProcessEntry> {
        names
            .iter()
            .enumerate()
            .map(|(i, name)| ProcessEntry {
                pid: (i + 1) as u32,
                name: (*name).into(),
            })
            .collect()
    }

    #[test]
    fn first_report_always_emits() {
        assert!(should_report(&None, &(entries(&["a"]), false)));
        assert!(should_report(&None, &(Vec::new(), true)));
    }

    #[test]
    fn repeated_failure_reports_once() {
        let failed = (Vec::new(), true);
        let mut last: Option<(Vec<ProcessEntry>, bool)> = None;
        assert!(should_report(&last, &failed));
        last = Some(failed.clone());
        assert!(!should_report(&last, &failed), "同一降级态不得每拍重报");
    }

    #[test]
    fn recovery_after_failure_reports_even_with_same_entries() {
        // 失败前与恢复后的 entries 相同，但 degraded 翻回 false，必须重报。
        let success = (entries(&["a"]), false);
        let last = Some((entries(&["a"]), true));
        assert!(should_report(&last, &success));
    }

    #[test]
    fn unchanged_success_is_silent() {
        let success = (entries(&["a"]), false);
        let last = Some(success.clone());
        assert!(!should_report(&last, &success));
        let changed = (entries(&["a", "b"]), false);
        assert!(should_report(&last, &changed));
    }
}
