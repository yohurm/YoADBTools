//! 采集任务账本收口与日志导出：默认目录策略与环容量入口都在此。commands 只校验在线并转发。
//!
//! **任务账本**（P0-1）：登记与收口都经 [`crate::run_ledger::RunLedger`]，同一把锁内完成，
//! 中间没有 `await`。`Stopped` 先于 `register` 到达时写墓碑，迟到的登记不再建任务。
//!
//! **默认导出目录单点**（P1-2）：[`default_export_dir`] 是壳侧唯一策略——设置值优先，
//! 空串回落 `paths.exports_dir()`。其它层不得自算第二套（保存框默认值由 `system.info`
//! 的 `paths.exports_dir` + 本函数语义对齐）。
//!
//! **环容量单入口**（P1-3）：[`apply_buffer_capacity`] 是壳侧唯一写 `RingStore` 容量的函数；
//! 设置变更与采集启动都经它，不再有第三处。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::run_ledger::RunLedger;
use crate::state::AppState;
use yohu_logsrv::{LogError, LogExporter};
use yohu_protocol::{CaptureStart, ExportRequest, ExportResult};

pub struct CaptureRuns {
    ledger: Arc<RunLedger>,
}

impl CaptureRuns {
    pub fn new() -> Self {
        Self {
            ledger: Arc::new(RunLedger::new()),
        }
    }

    /// 账本句柄。掉线清扫在后台任务里跑，必须能在 `AppState` 之外持有同一份账本。
    pub(crate) fn ledger(&self) -> Arc<RunLedger> {
        Arc::clone(&self.ledger)
    }
}

impl Default for CaptureRuns {
    fn default() -> Self {
        Self::new()
    }
}

/// 壳侧唯一环容量写点（`set_ring_capacity` 全壳只在这里出现一次）。
///
/// 与 [`crate::settings_apply::set`] 的关系：`settings_apply` 在 `buffer_capacity` 变更时
/// 调 [`apply_buffer_capacity`]（窗口立即生效）；[`CaptureShell::begin`] 在每次采集前按
/// 当前快照调同一个函数（保证采集用的就是设置值）。两处都是同一函数的调用点，语义单源。
fn set_capacity(capture: &yohu_logsrv::CaptureService, capacity: usize) {
    capture.set_ring_capacity(capacity);
}

/// 设置变更时的容量生效入口（`settings_apply` 唯一调用点）。
pub fn apply_buffer_capacity(state: &AppState, capacity: usize) {
    set_capacity(&state.capture, capacity);
}

/// 采集编排的句柄视图：账本 + 槽位 + 任务中心。
///
/// 壳（[`start`] / [`finish`] / [`sweep_with`]）与集成测试共用同一段编排——测试驱动的是
/// 产品代码，不是它的复制品。
pub(crate) struct CaptureShell {
    ledger: Arc<RunLedger>,
    capture: Arc<yohu_logsrv::CaptureService>,
    tasks: Arc<crate::tasks::TaskCenter>,
}

impl CaptureShell {
    pub(crate) fn new(
        ledger: Arc<RunLedger>,
        capture: Arc<yohu_logsrv::CaptureService>,
        tasks: Arc<crate::tasks::TaskCenter>,
    ) -> Self {
        Self {
            ledger,
            capture,
            tasks,
        }
    }

    pub(crate) fn of(state: &AppState) -> Self {
        Self {
            ledger: state.capture_runs.ledger(),
            capture: Arc::clone(&state.capture),
            tasks: Arc::clone(&state.tasks),
        }
    }

    /// 起流（不含登记）。与 [`Self::register`] 分成两步，是为了让「`Stopped` 已在分发器
    /// 被消费」与「登记尚未发生」这个真实交错可以被测试确定性地复现（P0-1 的 A2 表）。
    ///
    /// 起流前先 `begin` 在途标记：只有它存在时，早到的 `Stopped` 才会落墓碑。起流失败
    /// （取消 / `logcat -c` 失败）时 `abandon` 撤回标记与墓碑，不留泄漏。
    pub(crate) async fn begin(
        &self,
        serial: &str,
        capacity: usize,
        clear_device: bool,
    ) -> Result<CaptureStart, LogError> {
        set_capacity(&self.capture, capacity);
        self.ledger.begin(serial);
        match self.capture.start(serial, clear_device).await {
            Ok(result) => {
                if result.adopted {
                    // adopt：命中已在 Live 的流，没有新任务要登记。撤掉本次在途标记，
                    // 否则它会永留（`register` 对 adopt 直接返回），后续重复 `close` 会写多余墓碑。
                    self.ledger.abandon(serial);
                }
                Ok(result)
            }
            Err(err) => {
                self.ledger.abandon(serial);
                Err(err)
            }
        }
    }

    /// 登记。与「该世代是否已收口」的判定在同一把锁内：`make_task` 只做内存插入与非阻塞
    /// 唤醒（无 `await`），所以 `Stopped` 先到就命中墓碑、根本不建任务。
    pub(crate) fn register(&self, serial: &str, result: &CaptureStart) {
        if result.adopted {
            return;
        }
        let ledger = Arc::clone(&self.ledger);
        let tasks = Arc::clone(&self.tasks);
        let serial_owned = serial.to_string();
        let outcome = ledger.register_with(serial, result.generation, || {
            tasks.register(
                format!("logcat 采集: {serial_owned}"),
                crate::tasks::device_detail(&serial_owned),
                None,
            )
        });
        tracing::debug!(
            serial,
            generation = result.generation,
            ?outcome,
            "采集任务账本登记"
        );
    }

    /// 起流 + 登记。
    pub(crate) async fn start(
        &self,
        serial: &str,
        capacity: usize,
        clear_device: bool,
    ) -> Result<CaptureStart, LogError> {
        let result = self.begin(serial, capacity, clear_device).await?;
        self.register(serial, &result);
        Ok(result)
    }

    /// 收口：只结束匹配世代的任务；迟到旧世代写墓碑、不误杀新任务。
    pub(crate) fn finish(&self, serial: &str, generation: u64) {
        if let Some(task_id) = self.ledger.close(serial, generation) {
            self.tasks.finish(task_id);
        }
    }

    /// 自愈点（P1-7）：收口「槽位已不再持有、账本仍 Active」的世代。
    pub(crate) fn sweep(&self, serial: &str) {
        let status = self.capture.status(serial);
        let live = if status.capturing {
            Some(status.generation)
        } else {
            None
        };
        let finished = self.ledger.sweep(serial, live);
        for task_id in &finished {
            self.tasks.finish(*task_id);
        }
        if !finished.is_empty() {
            tracing::info!(
                serial,
                n = finished.len(),
                "任务账本清扫：槽位已释放的世代已收口"
            );
        }
    }
}

/// 调用方已鉴权。
pub async fn start(state: &AppState, serial: &str) -> Result<CaptureStart, LogError> {
    tracing::info!(serial = %serial, "log.capture.start");
    let snap = state.settings.snapshot();
    CaptureShell::of(state)
        .start(serial, snap.buffer_capacity, snap.clear_device_on_start)
        .await
}

/// 任务中心收口：只结束匹配世代的任务；迟到旧世代写墓碑、不误杀新任务。
pub fn finish(state: &AppState, serial: &str, generation: u64) {
    CaptureShell::of(state).finish(serial, generation);
}

/// 自愈点（P1-7）：掉线/切换之后，把「槽位已不再持有、账本仍 Active」的世代一次性收口。
///
/// 掉线是常规路径（自动刷新 2s）。`detach_device` 收敛之后调用，使掉线成为恢复点而不是
/// 泄漏源。句柄式入口：后台任务持有账本/槽位/任务中心的克隆，不依赖 `AppState` 生命周期。
pub(crate) fn sweep_with(
    ledger: &Arc<RunLedger>,
    capture: &Arc<yohu_logsrv::CaptureService>,
    tasks: &Arc<crate::tasks::TaskCenter>,
    serial: &str,
) {
    CaptureShell::new(Arc::clone(ledger), Arc::clone(capture), Arc::clone(tasks)).sweep(serial);
}

pub fn default_export_dir(export_default_path: &str, fallback: PathBuf) -> PathBuf {
    if export_default_path.is_empty() {
        fallback
    } else {
        PathBuf::from(export_default_path)
    }
}

/// 导出环快照。同步扫环 + 落盘放到阻塞池，命令层 await。
///
/// `ExportResult` 原样回给命令层（`lines` 是过滤后实际写出的条数，调用方据此提示）。
pub async fn export(state: &AppState, req: ExportRequest) -> Result<ExportResult, LogError> {
    let default_dir = default_export_dir(
        &state.settings.snapshot().export_default_path,
        state.paths.exports_dir(),
    );
    let rings = Arc::clone(state.capture.ring_store());
    let serial = req.serial;
    let from_seq = req.from_seq;
    let filter = req.filter;
    let dest = req.path;
    let result = tokio::task::spawn_blocking(move || {
        LogExporter::export(
            &rings,
            &serial,
            from_seq,
            &filter,
            dest.as_deref().map(Path::new),
            Some(default_dir.as_path()),
        )
    })
    .await
    .map_err(|_| LogError::ExportJoin)??;
    state.app_log.info(format!("日志已导出: {}", result.path));
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::run_ledger::RegisterOutcome;
    use yohu_adb::{AdbClient, ToolResolver};
    use yohu_logsrv::CaptureService;
    use yohu_protocol::AppSettings;

    #[test]
    fn empty_setting_uses_fallback() {
        let dir = default_export_dir("", PathBuf::from("/exports"));
        assert_eq!(dir, PathBuf::from("/exports"));
    }

    #[test]
    fn setting_overrides_fallback() {
        let dir = default_export_dir("D:/logs", PathBuf::from("/exports"));
        assert_eq!(dir, PathBuf::from("D:/logs"));
    }

    #[test]
    fn blank_setting_falls_back_like_the_core_policy() {
        // 设置默认是空串 → 回落数据目录下的 exports。
        assert_eq!(AppSettings::default().export_default_path, "");
        assert_eq!(
            default_export_dir(
                &AppSettings::default().export_default_path,
                PathBuf::from("/data/exports")
            ),
            PathBuf::from("/data/exports")
        );
    }

    /// P0-1：Stopped 先于 register 时，登记不得留下 Active 任务。
    #[test]
    fn stopped_before_register_creates_no_task() {
        let runs = CaptureRuns::new();
        // 分发器先消费到 Stopped（槽位已 publish 但 start 还没返回）。
        runs.ledger.begin("S1");
        assert_eq!(runs.ledger.close("S1", 5), None);

        let outcome = runs.ledger.register_with("S1", 5, || 11);
        assert_eq!(outcome, RegisterOutcome::AlreadyClosed);
        assert_eq!(runs.ledger.registered_len(), 0, "不得留下 Active 任务");
        assert_eq!(runs.ledger.tombstone_len(), 0, "墓碑被消费");

        // 之后同一世代再收口不得产生第二次效果。
        assert_eq!(runs.ledger.close("S1", 5), None);
    }

    /// P0-1 并发形态：真实交错（`Stopped` 与 `register` 分属两个线程、同一世代）只允许
    /// 两种结局，且账本自洽：要么登记成功且收口命中同一条任务，要么收口先到、根本没建任务。
    #[test]
    fn concurrent_register_and_close_never_leak() {
        use std::sync::atomic::{AtomicU32, Ordering};

        let runs = Arc::new(CaptureRuns::new());
        let next_task = Arc::new(AtomicU32::new(1));
        const WORKERS: u64 = 4;
        const ROUNDS: u64 = 300;
        let mut handles = Vec::new();

        for worker in 0..WORKERS {
            let runs = Arc::clone(&runs);
            let next_task = Arc::clone(&next_task);
            handles.push(std::thread::spawn(move || {
                for round in 0..ROUNDS {
                    // 每个 (worker, round) 是一个独立世代，用**独立 serial**：
                    // 产品里同一 serial 的 start 由 runExclusive 串行、同世代只登记一次，
                    // 不会出现同一 serial 多个在途世代；测试据此隔离，才能检验账本自洽。
                    let generation = worker * ROUNDS + round;
                    let serial = format!("S{worker}-{round}");
                    runs.ledger.begin(&serial);
                    let closer = {
                        let runs = Arc::clone(&runs);
                        let serial = serial.clone();
                        std::thread::spawn(move || runs.ledger.close(&serial, generation))
                    };
                    let id = next_task.fetch_add(1, Ordering::Relaxed);
                    let outcome = runs.ledger.register_with(&serial, generation, || id);
                    let closed = closer.join().expect("close thread");
                    match outcome {
                        RegisterOutcome::Registered => {
                            assert_eq!(
                                closed,
                                Some(id),
                                "登记成功则收口必须命中同一条任务（gen {generation}）"
                            );
                        }
                        RegisterOutcome::AlreadyClosed => {
                            assert_eq!(
                                closed, None,
                                "收口先到则不得再取到任务（gen {generation}）"
                            );
                        }
                    }
                }
            }));
        }
        for handle in handles {
            handle.join().expect("worker");
        }

        // 每轮恰好一个结局，全部收口后账本清空（无泄漏、无墓碑残留）。
        assert_eq!(runs.ledger.registered_len(), 0, "不得有残留 Active 任务");
        assert_eq!(runs.ledger.tombstone_len(), 0, "不得有残留墓碑");
        assert_eq!(runs.ledger.inflight_len(), 0, "不得有残留在途标记");
    }

    /// 真实交错：分发器线程先收到 `Stopped`，登记线程随后才拿到 `start` 返回值。
    ///
    /// 这是 A2 表第 1/2/3 行的交错——用屏障把「收口」钉在「登记」之前，不靠竞速运气。
    #[test]
    fn stopped_observed_before_register_returns_leaves_no_active_task() {
        use std::sync::Barrier;

        let runs = Arc::new(CaptureRuns::new());
        let barrier = Arc::new(Barrier::new(2));
        const GENERATION: u64 = 42;
        runs.ledger.begin("S1");

        let dispatcher = {
            let runs = Arc::clone(&runs);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                // 分发器：先消费 Stopped（槽位已 publish Live、start 还没返回）。
                let closed = runs.ledger.close("S1", GENERATION);
                barrier.wait();
                closed
            })
        };
        barrier.wait();
        // 登记侧：等分发器确实收口之后再登记（复现危险窗口的后半段）。
        let mut created = false;
        let outcome = runs.ledger.register_with("S1", GENERATION, || {
            created = true;
            7
        });
        let closed = dispatcher.join().expect("dispatcher");

        assert_eq!(closed, None, "收口时任务尚未登记");
        assert_eq!(outcome, RegisterOutcome::AlreadyClosed);
        assert!(!created, "已收口世代不得建任务");
        assert_eq!(runs.ledger.registered_len(), 0, "任务不得永久 Active");
        assert_eq!(runs.ledger.tombstone_len(), 0, "墓碑被消费");
    }

    /// 自愈点：掉线后槽位 Empty，账本仍 Active 的世代被清扫收口。
    #[test]
    fn sweep_closes_generations_the_slot_no_longer_owns() {
        let runs = CaptureRuns::new();
        runs.ledger.begin("S1");
        assert_eq!(runs.ledger.register_with("S1", 3, || 21), RegisterOutcome::Registered);
        runs.ledger.begin("S1");
        assert_eq!(runs.ledger.register_with("S1", 4, || 22), RegisterOutcome::Registered);
        let mut swept = runs.ledger.sweep("S1", None);
        swept.sort_unstable();
        assert_eq!(swept, vec![21, 22]);
        assert_eq!(runs.ledger.registered_len(), 0);
    }

    /// 迟到旧世代收口不得误杀新世代任务（原有不变量保持）。
    #[test]
    fn finish_matches_generation_only() {
        let runs = CaptureRuns::new();
        runs.ledger.begin("S1");
        assert_eq!(runs.ledger.register_with("S1", 5, || 11), RegisterOutcome::Registered);
        assert_eq!(runs.ledger.close("S1", 4), None, "旧世代不得结束新任务");
        assert_eq!(runs.ledger.close("S1", 5), Some(11));
        assert_eq!(runs.ledger.close("S1", 5), None, "同一任务只收口一次");
    }

    /// 账本键是 `(serial, generation)`：同世代不同 serial 互不影响。
    #[test]
    fn ledger_key_includes_serial() {
        let runs = CaptureRuns::new();
        runs.ledger.begin("S1");
        assert_eq!(runs.ledger.register_with("S1", 2, || 31), RegisterOutcome::Registered);
        runs.ledger.begin("S2");
        assert_eq!(runs.ledger.register_with("S2", 2, || 32), RegisterOutcome::Registered);
        assert_eq!(runs.ledger.close("S1", 2), Some(31));
        assert_eq!(runs.ledger.close("S2", 2), Some(32));
    }

    /// 分发器与登记共用一份账本：`CaptureRuns` 不另持任务 map 镜像。
    #[test]
    fn ledger_owns_the_only_task_map() {
        let runs = CaptureRuns::new();
        assert_eq!(runs.ledger.registered_len(), 0);
        assert_eq!(runs.ledger.tombstone_len(), 0);
        runs.ledger.begin("S1");
        assert_eq!(runs.ledger.register_with("S1", 1, || 7), RegisterOutcome::Registered);
        assert_eq!(runs.ledger.registered_len(), 1);
    }

    // ---- fake-adb 集成：真实槽位 + 真实分发器顺序，覆盖「Stopped 先于 register」 ----

    /// 定位 fake-adb：workspace member 的明文 bin 位于 `target/<profile>/fake-adb`
    /// （Windows 带 `.exe`；`cargo build --workspace` 产出）。
    fn fake_adb_src() -> PathBuf {
        let mut profile = std::env::current_exe().expect("测试进程路径");
        profile.pop(); // deps/
        profile.pop(); // debug/ | release/
        let exe = profile.join(yohu_runtime::host_bin_name("fake-adb"));
        assert!(
            exe.is_file(),
            "找不到 {} — 请先执行 cargo build --workspace（集成测试依赖明文 bin）",
            exe.display()
        );
        exe
    }

    /// 每个测试一份隔离的 fake adb（exe 副本 + 同名 json 脚本），零共享状态。
    fn isolated_fake_adb(script: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "yohu-shell-fake-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&dir).expect("创建临时目录失败");
        let exe = dir.join(yohu_runtime::host_bin_name("fake-adb"));
        std::fs::copy(fake_adb_src(), &exe).expect("拷贝 fake-adb 失败");
        yohu_runtime::ensure_executable(&exe).expect("fake-adb 可执行位");
        std::fs::write(exe.with_extension("json"), script).expect("写脚本失败");
        exe
    }

    /// 长驻流：采集起来后一直跑，直到槽位 stop。
    const TICK_FOREVER: &str = r#"{
        "logcat_lines": ["[ 2026-01-02 03:04:05.678  1: 2 I/T ]", "tick"],
        "logcat_delay_ms": 20,
        "logcat_forever": true
    }"#;

    /// 立刻以掉线特征退出的流：跟流工人 `Offline` → `release_if_current` → `publish_stopped`。
    const OFFLINE_AFTER_ONE: &str = r#"{
        "logcat_lines": ["[ 2026-01-02 03:04:05.678  1: 2 I/T ]", "bye"],
        "logcat_delay_ms": 5,
        "logcat_exit_code": 1,
        "logcat_stderr": "adb: device offline"
    }"#;

    fn shell_with(
        adb_exe: PathBuf,
    ) -> (
        CaptureShell,
        Arc<crate::tasks::TaskCenter>,
        tokio::sync::mpsc::Receiver<yohu_protocol::AppEvent>,
    ) {
        let tool = ToolResolver::new(
            Some(adb_exe),
            PathBuf::from("nonexistent-resource"),
            std::env::temp_dir().join(format!("yohu-shell-data-{}", std::process::id())),
        );
        let client = Arc::new(AdbClient::new(tool, 4));
        let (event_tx, event_rx) = tokio::sync::mpsc::channel(256);
        let capture = CaptureService::new(
            client,
            event_tx.clone(),
            1000,
            tokio_util::sync::CancellationToken::new(),
        );
        let tasks = Arc::new(crate::tasks::TaskCenter::new(event_tx));
        let shell = CaptureShell::new(Arc::new(RunLedger::new()), Arc::clone(&capture), Arc::clone(&tasks));
        (shell, tasks, event_rx)
    }

    /// 等槽位出现该世代的 `Stopped`（分发器收到的就是这一条）。
    async fn wait_stopped(
        rx: &mut tokio::sync::mpsc::Receiver<yohu_protocol::AppEvent>,
        generation: u64,
    ) {
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(15);
        while tokio::time::Instant::now() < deadline {
            match tokio::time::timeout(std::time::Duration::from_millis(200), rx.recv()).await {
                Ok(Some(yohu_protocol::AppEvent::CaptureState {
                    generation: seen,
                    state: yohu_protocol::CaptureState::Stopped,
                    ..
                })) if seen == generation => return,
                Ok(Some(_)) | Err(_) => {}
                Ok(None) => break,
            }
        }
        panic!("未观察到世代 {generation} 的 Stopped");
    }

    /// **P0-1 运行观察（fake-adb）**：掉线路径上 `Stopped` 先被分发器消费，随后才 `register`。
    ///
    /// 旧实现下这会留下一条永久 Active 的任务；现在墓碑把登记吃掉，任务列表为空。
    #[tokio::test]
    async fn offline_before_register_leaves_no_active_task_fake_adb() {
        let (shell, tasks, mut rx) = shell_with(isolated_fake_adb(OFFLINE_AFTER_ONE));

        // 1) 起流（真实 logcat 子进程 → 掉线 → 槽位 publish_stopped）。
        let result = shell
            .begin("R58M1234A", 1000, false)
            .await
            .expect("开始采集");
        assert!(!result.adopted);

        // 2) 分发器先消费 Stopped 并收口（真实顺序：事件队列比 IPC 返回先到）。
        wait_stopped(&mut rx, result.generation).await;
        shell.finish("R58M1234A", result.generation);

        // 3) IPC 返回之后才登记——必须被墓碑吃掉。
        shell.register("R58M1234A", &result);

        let listed = tasks.summary();
        assert!(
            listed.is_empty(),
            "已收口世代不得留下 Active 任务，实际: {listed:?}"
        );
        assert_eq!(shell.ledger.registered_len(), 0);
        assert_eq!(shell.ledger.tombstone_len(), 0, "墓碑被消费");

        shell.capture.stop("R58M1234A").await;
    }

    /// **P0-1 对照（fake-adb）**：正常顺序（先登记、后掉线）仍能正确收口。
    /// **P0-1 对照（fake-adb）**：正常顺序（先登记、后掉线）仍能正确收口。
    #[tokio::test]
    async fn register_before_stopped_still_closes_the_task_fake_adb() {
        let (shell, tasks, mut rx) = shell_with(isolated_fake_adb(TICK_FOREVER));

        let result = shell
            .begin("R58M1234A", 1000, false)
            .await
            .expect("开始采集");
        shell.register("R58M1234A", &result);
        assert_eq!(tasks.summary().len(), 1, "正常顺序应登记一条任务");
        assert!(tasks.summary()[0].active);

        // 真实 stop → 槽位 join → publish_stopped → 分发器收口。
        shell.capture.stop("R58M1234A").await;
        wait_stopped(&mut rx, result.generation).await;
        shell.finish("R58M1234A", result.generation);

        let listed = tasks.summary();
        assert_eq!(listed.len(), 1, "任务仍留在列表（终态）");
        assert!(!listed[0].active, "必须已收口");
        assert_eq!(shell.ledger.registered_len(), 0);
    }

    /// **P2-3 运行观察（fake-adb）**：对已在 Live 的流再次 `begin` 会 adopt；adopt 分支必须
    /// 清掉本次 `RunLedger` 的在途标记，不留残留在途/墓碑。
    #[tokio::test]
    async fn adopt_clears_inflight_ledger_marker_fake_adb() {
        let (shell, tasks, _rx) = shell_with(isolated_fake_adb(TICK_FOREVER));

        let first = shell
            .begin("R58M1234A", 1000, false)
            .await
            .expect("首次采集");
        assert!(!first.adopted);
        shell.register("R58M1234A", &first);
        assert_eq!(shell.ledger.inflight_len(), 0, "登记后不应在途");
        assert_eq!(tasks.summary().len(), 1);

        // 第二次 begin：槽位已在 Live → adopt，不得留下本次在途标记。
        let second = shell.begin("R58M1234A", 1000, false).await.expect("adopt");
        assert!(second.adopted, "第二次起流应命中 adopt");
        assert_eq!(second.generation, first.generation);
        assert_eq!(
            shell.ledger.inflight_len(),
            0,
            "adopt 必须撤掉本次在途标记"
        );
        assert_eq!(shell.ledger.tombstone_len(), 0, "adopt 不得残留墓碑");
        assert_eq!(tasks.summary().len(), 1, "adopt 不新建任务");

        shell.capture.stop("R58M1234A").await;
    }

    /// **P1-7 运行观察（fake-adb）**：掉线后槽位 Empty，清扫把残留 Active 收口。
    #[tokio::test]
    async fn sweep_heals_active_ledger_after_device_detach_fake_adb() {
        let (shell, tasks, _rx) = shell_with(isolated_fake_adb(TICK_FOREVER));

        let result = shell
            .begin("R58M1234A", 1000, false)
            .await
            .expect("开始采集");
        shell.register("R58M1234A", &result);
        assert_eq!(shell.ledger.registered_len(), 1);

        // 掉线路径：detach（stop + clear）之后清扫。这里跳过事件消费，模拟「Stopped 丢在
        // 收尾之后」的最坏情况——清扫必须自己把账本对齐。
        shell.capture.detach_device("R58M1234A").await;
        assert!(!shell.capture.status("R58M1234A").capturing);
        shell.sweep("R58M1234A");

        assert_eq!(shell.ledger.registered_len(), 0, "清扫必须收口残留 Active");
        let listed = tasks.summary();
        assert!(listed.iter().all(|t| !t.active), "清扫后不得有 Active 任务");
    }
}
