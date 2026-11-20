//! 采集槽位状态机：Empty → Starting(gen) → Live(gen) → Stopping(gen) → Empty。
//!
//! 唯一持有槽位/世代状态与跟流监督。环由 [`crate::ring_store::RingStore`]、
//! 窗口命中由 [`crate::windows::WindowBook`] 各自持有；本类型只编排代际资源。
//! 工人退出不得拆代际资源、不得发 Stopped；Stopped 只来自末 hold 的 stop / 掉线 / 永久失败 / Starting 放弃。
//! start 仅对 Live **adopt**；Starting/Stopping 等待后再决定。新流才 `ring.clear()`。
//! 控制面 `CaptureState` 带 generation 且 `send().await` 必达；批次仍 `try_send`。
//!
//! ## 四态同构（P2）
//!
//! `Empty` 是**显式**状态（[`Phase::Empty`]），不再靠「map 里没有这个 serial」表达：
//! `captures` 里每个出现过的 serial 都有一个槽位，相位为四态之一。
//! `Empty` 携带 `last_generation`（该 serial 最近一次结束的世代），`status()` 因此不必走两条分支。
//! 槽位只在设备生命周期终点（[`crate::capture::CaptureService::detach_device`]）才真正移除。

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::{mpsc, Notify};
use tokio_util::sync::CancellationToken;

use crate::batch::{Batcher, BATCH_FLUSH_INTERVAL, BATCH_MAX_BYTES, BATCH_MAX_LINES};
use crate::capture::LogError;
use crate::follow::{supervise_follow, FollowEnd};
use crate::index::ProcessIndexService;
use crate::ring_store::RingStore;
use crate::task::join_workers;
use crate::windows::WindowBook;
use yohu_adb::AdbClient;
use yohu_protocol::{AppEvent, CaptureStart, CaptureState};

/// 槽位相位。四态同构：Empty 显式携带该 serial 的最后世代。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    /// 未采集。`last_generation` 是该 serial 最近一次结束的世代（从未采过为 0）。
    Empty { last_generation: u64 },
    Starting,
    Live,
    Stopping,
}

impl Phase {
    fn name(self) -> &'static str {
        match self {
            Phase::Empty { .. } => "Empty",
            Phase::Starting => "Starting",
            Phase::Live => "Live",
            Phase::Stopping => "Stopping",
        }
    }

    /// Starting 与 Live 占着采集。Stopping 要等，不在这一把里。
    fn occupies(self) -> bool {
        matches!(self, Phase::Starting | Phase::Live)
    }

    fn is_empty(self) -> bool {
        matches!(self, Phase::Empty { .. })
    }
}

struct CaptureSlot {
    generation: u64,
    phase: Phase,
    cancel: CancellationToken,
    capture_handle: Option<tokio::task::JoinHandle<()>>,
    index_handle: Option<tokio::task::JoinHandle<()>>,
    batch_handle: Option<tokio::task::JoinHandle<()>>,
}

impl CaptureSlot {
    /// 不变量：相位与句柄/取消令牌必须一致（P2 断言项）。
    ///
    /// 注意 `Empty` 是**显式**状态且仍保留在本 map 里（`settle_to_empty` 只把句柄取走，
    /// 相位改 `Empty{last_generation}`），因此这里断言的是「Empty 槽位句柄皆 None」，
    /// 不是「Empty 不持有槽位」——后者与实现相反，是误导性死断言。
    fn check_invariants(&self, serial: &str) {
        if self.phase == Phase::Stopping {
            debug_assert!(
                self.cancel.is_cancelled(),
                "Stopping ⇒ cancel 已取消（{serial} gen={}）",
                self.generation
            );
        }
        if self.phase.is_empty() {
            debug_assert!(
                self.capture_handle.is_none(),
                "Empty 槽位不得持有 capture 句柄（{serial}）"
            );
            debug_assert!(
                self.index_handle.is_none(),
                "Empty 槽位不得持有 index 句柄（{serial}）"
            );
            debug_assert!(
                self.batch_handle.is_none(),
                "Empty 槽位不得持有 batch 句柄（{serial}）"
            );
        }
    }
}

struct Inner {
    captures: HashMap<String, CaptureSlot>,
    next_generation: u64,
}

impl Inner {
    fn check_generation_monotonic(&self) {
        debug_assert!(
            self.captures
                .values()
                .all(|slot| slot.generation <= self.next_generation),
            "next_generation 必须不小于任何已分配世代"
        );
    }
}

enum StartDecision {
    Adopt(CaptureStart),
    Begin {
        generation: u64,
        cancel: CancellationToken,
    },
    Wait,
}

fn same_generation(slot_generation: u64, expected: u64) -> bool {
    slot_generation == expected
}

/// 采集槽位状态机（唯一持槽位状态者）。
pub(crate) struct CaptureSlots {
    adb: Arc<AdbClient>,
    index: Arc<ProcessIndexService>,
    sink: mpsc::Sender<AppEvent>,
    windows: Arc<WindowBook>,
    rings: Arc<RingStore>,
    inner: Mutex<Inner>,
    changed: Notify,
    /// 应用根取消令牌：每个采集槽位令牌都是它的子令牌。
    root_cancel: CancellationToken,
}

impl CaptureSlots {
    pub(crate) fn new(
        adb: Arc<AdbClient>,
        index: Arc<ProcessIndexService>,
        sink: mpsc::Sender<AppEvent>,
        windows: Arc<WindowBook>,
        rings: Arc<RingStore>,
        root_cancel: CancellationToken,
    ) -> Self {
        Self {
            adb,
            index,
            sink,
            windows,
            rings,
            inner: Mutex::new(Inner {
                captures: HashMap::new(),
                next_generation: 0,
            }),
            changed: Notify::new(),
            root_cancel,
        }
    }

    fn lock_inner(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().expect("capture lock poisoned")
    }

    fn decide_start(&self, serial: &str) -> StartDecision {
        let mut inner = self.lock_inner();
        let existing = inner.captures.get(serial).map(|slot| (slot.phase, slot.generation));
        match existing {
            Some((Phase::Live, generation)) => StartDecision::Adopt(CaptureStart {
                serial: serial.to_string(),
                generation,
                adopted: true,
            }),
            Some((Phase::Starting | Phase::Stopping, _)) => StartDecision::Wait,
            Some((Phase::Empty { .. }, _)) | None => {
                inner.next_generation += 1;
                let generation = inner.next_generation;
                let cancel = self.root_cancel.child_token();
                inner.captures.insert(
                    serial.to_string(),
                    CaptureSlot {
                        generation,
                        phase: Phase::Starting,
                        cancel: cancel.clone(),
                        capture_handle: None,
                        index_handle: None,
                        batch_handle: None,
                    },
                );
                inner.check_generation_monotonic();
                StartDecision::Begin { generation, cancel }
            }
        }
    }

    fn start_must_wait(&self, serial: &str) -> bool {
        let inner = self.lock_inner();
        matches!(
            inner.captures.get(serial).map(|slot| slot.phase),
            Some(Phase::Starting | Phase::Stopping)
        )
    }

    /// `(capturing, generation)`：Stopping 视为未采集；Empty 报最后世代。
    pub(crate) fn status(&self, serial: &str) -> (bool, u64) {
        let inner = self.lock_inner();
        match inner.captures.get(serial) {
            Some(slot) => (slot.phase.occupies(), slot.generation),
            // 从未出现过该 serial：从未采过，世代 0
            None => (false, 0),
        }
    }

    /// 批量器一落地就挂到槽位（属代际资源），确保 stop/abandon/release 都能收敛它。
    fn attach_batch_handle(
        &self,
        serial: &str,
        generation: u64,
        handle: tokio::task::JoinHandle<()>,
    ) -> Result<(), tokio::task::JoinHandle<()>> {
        let mut inner = self.lock_inner();
        match inner.captures.get_mut(serial) {
            Some(slot)
                if same_generation(slot.generation, generation) && slot.phase == Phase::Starting =>
            {
                slot.batch_handle = Some(handle);
                Ok(())
            }
            _ => Err(handle),
        }
    }

    fn take_batch_handle(
        &self,
        serial: &str,
        generation: u64,
    ) -> Option<tokio::task::JoinHandle<()>> {
        let mut inner = self.lock_inner();
        inner
            .captures
            .get_mut(serial)
            .filter(|slot| same_generation(slot.generation, generation))
            .and_then(|slot| slot.batch_handle.take())
    }

    /// 把槽位转成 Empty（带该世代作为 last_generation），三路句柄一并取出交给调用方收敛。
    ///
    /// 返回 `None` 表示槽位已不是期望的相位/世代（迟到世代），调用方不得发 Stopped。
    fn settle_to_empty(
        inner: &mut Inner,
        serial: &str,
        generation: u64,
        expected: &[Phase],
    ) -> Option<CaptureSlot> {
        let slot = inner.captures.get_mut(serial)?;
        if !same_generation(slot.generation, generation) {
            return None;
        }
        if !expected.contains(&slot.phase) {
            return None;
        }
        // 相位转 Empty 并记住该世代；句柄交回调用方在锁外 join。
        slot.phase = Phase::Empty {
            last_generation: generation,
        };
        Some(CaptureSlot {
            generation: slot.generation,
            phase: Phase::Empty {
                last_generation: generation,
            },
            cancel: slot.cancel.clone(),
            capture_handle: slot.capture_handle.take(),
            index_handle: slot.index_handle.take(),
            batch_handle: slot.batch_handle.take(),
        })
    }

    /// 开始跟流。仅 Live 可 adopt。Starting/Stopping 等待后再决定。新流跟流前清空本设备环。
    pub(crate) async fn start(
        self: &Arc<Self>,
        serial: &str,
        clear_device: bool,
    ) -> Result<CaptureStart, LogError> {
        let (my_generation, cancel) = loop {
            match self.decide_start(serial) {
                StartDecision::Adopt(result) => {
                    tracing::info!(
                        serial,
                        generation = result.generation,
                        "采集 adopt（已在 Live）"
                    );
                    return Ok(result);
                }
                StartDecision::Begin { generation, cancel } => {
                    self.changed.notify_waiters();
                    break (generation, cancel);
                }
                StartDecision::Wait => {
                    // 先注册唤醒再查条件：`notified()` 只在首次 poll 注册，若在创建与 poll 之间
                    // 发生 `notify_waiters()`（另一线程把槽位推进 Live），唤醒会永久丢失、
                    // start 永久挂起。`enable()` 先把本 future 挂进等待表，再检查条件。
                    let notified = self.changed.notified();
                    tokio::pin!(notified);
                    notified.as_mut().enable();
                    if self.start_must_wait(serial) {
                        notified.await;
                    }
                }
            }
        };

        if clear_device {
            if let Err(e) = self.adb.clear_log(serial, cancel.clone()).await {
                self.abandon_starting(serial, my_generation).await;
                return if cancel.is_cancelled() {
                    Err(LogError::Cancelled)
                } else {
                    Err(e.into())
                };
            }
        }
        if cancel.is_cancelled() {
            self.abandon_starting(serial, my_generation).await;
            return Err(LogError::Cancelled);
        }

        // 只有采集侧创建环；容量由 RingStore 单点下推（本处不再写容量）。
        let ring = self.rings.ensure_ring(serial);
        ring.clear();
        self.windows.clear_serial(serial);
        let (batcher, batch_handle) = Batcher::spawn(
            serial.to_string(),
            self.sink.clone(),
            BATCH_FLUSH_INTERVAL,
            BATCH_MAX_LINES,
            BATCH_MAX_BYTES,
            cancel.clone(),
        );
        // 槽位可能在启动期间被 stop 取消：批量器句柄无法挂回则立即收敛。
        let unowned_batch = self
            .attach_batch_handle(serial, my_generation, batch_handle)
            .err();
        if let Some(handle) = unowned_batch {
            cancel.cancel();
            join_workers(None, None, Some(handle)).await;
            self.abandon_starting(serial, my_generation).await;
            return Err(LogError::Cancelled);
        }

        // 控制面 Running 先于工人：避免 logcat 批次占满有界 sink 后 start 卡在 send。
        self.emit_state(serial, my_generation, CaptureState::Running)
            .await;
        if cancel.is_cancelled() {
            self.abandon_starting(serial, my_generation).await;
            return Err(LogError::Cancelled);
        }

        let adb = Arc::clone(&self.adb);
        let slots = Arc::clone(self);
        let serial_owned = serial.to_string();
        let follow_cancel = cancel.clone();
        let capture_handle = tokio::spawn(async move {
            let end = supervise_follow(
                adb,
                serial_owned.clone(),
                ring,
                Arc::clone(&slots.windows),
                batcher,
                follow_cancel,
            )
            .await;
            if matches!(end, FollowEnd::Offline | FollowEnd::Terminal) {
                slots
                    .release_if_current(&serial_owned, my_generation)
                    .await;
            }
        });

        let index_handle = self.index.spawn(serial.to_string(), my_generation, cancel.clone());

        let mut capture_handle = Some(capture_handle);
        let mut index_handle = Some(index_handle);
        let published = {
            let mut inner = self.lock_inner();
            match inner.captures.get_mut(serial) {
                Some(slot)
                    if same_generation(slot.generation, my_generation)
                        && slot.phase == Phase::Starting =>
                {
                    slot.phase = Phase::Live;
                    slot.capture_handle = capture_handle.take();
                    slot.index_handle = index_handle.take();
                    slot.check_invariants(serial);
                    true
                }
                _ => false,
            }
        };

        if !published {
            cancel.cancel();
            join_workers(capture_handle, index_handle, None).await;
            let leftover = self.take_batch_handle(serial, my_generation);
            join_workers(None, None, leftover).await;
            return Err(LogError::Cancelled);
        }
        self.changed.notify_waiters();
        tracing::info!(serial, generation = my_generation, "采集开始");
        Ok(CaptureStart {
            serial: serial.to_string(),
            generation: my_generation,
            adopted: false,
        })
    }

    pub(crate) async fn stop(&self, serial: &str) {
        let (generation, cap_h, idx_h, batch_h) = loop {
            let wait = {
                let mut inner = self.lock_inner();
                match inner.captures.get_mut(serial) {
                    None => return,
                    Some(slot) if slot.phase == Phase::Stopping => true,
                    Some(slot) if slot.phase.is_empty() => {
                        // Empty 是显式状态：没有在采的东西可停，幂等返回
                        return;
                    }
                    Some(slot) => {
                        slot.phase = Phase::Stopping;
                        slot.cancel.cancel();
                        slot.check_invariants(serial);
                        break (
                            slot.generation,
                            slot.capture_handle.take(),
                            slot.index_handle.take(),
                            slot.batch_handle.take(),
                        );
                    }
                }
            };
            if wait {
                // 同 start：先把 notified 挂进等待表再查条件，避免 notify_waiters 落在
                // 创建与首次 poll 之间导致 stop 永久挂起。
                let notified = self.changed.notified();
                tokio::pin!(notified);
                notified.as_mut().enable();
                let still_stopping = {
                    let inner = self.lock_inner();
                    matches!(
                        inner.captures.get(serial).map(|slot| slot.phase),
                        Some(Phase::Stopping)
                    )
                };
                if still_stopping {
                    notified.await;
                }
            }
        };
        self.changed.notify_waiters();

        join_workers(cap_h, idx_h, batch_h).await;

        let settled = {
            let mut inner = self.lock_inner();
            let taken = Self::settle_to_empty(&mut inner, serial, generation, &[Phase::Stopping]);
            taken.is_some()
        };
        if settled {
            self.publish_stopped(serial, generation).await;
            tracing::info!(serial, generation, "采集停止");
        } else {
            tracing::info!(serial, generation, "采集停止被更新世代取代，丢弃 Stopped");
        }
        self.changed.notify_waiters();
    }

    async fn publish_stopped(&self, serial: &str, generation: u64) {
        self.emit_state(serial, generation, CaptureState::Stopped)
            .await;
    }

    async fn emit_state(&self, serial: &str, generation: u64, state: CaptureState) {
        let _ = self
            .sink
            .send(AppEvent::CaptureState {
                serial: serial.to_string(),
                generation,
                state,
            })
            .await;
    }

    async fn abandon_starting(&self, serial: &str, generation: u64) {
        let taken = {
            let mut inner = self.lock_inner();
            Self::settle_to_empty(&mut inner, serial, generation, &[Phase::Starting])
        };
        if let Some(mut slot) = taken {
            slot.cancel.cancel();
            let capture = slot.capture_handle.take();
            let index = slot.index_handle.take();
            let batch = slot.batch_handle.take();
            join_workers(capture, index, batch).await;
            self.publish_stopped(serial, generation).await;
            tracing::info!(serial, generation, "采集 Starting 已放弃");
            self.changed.notify_waiters();
        }
    }

    async fn release_if_current(&self, serial: &str, generation: u64) {
        let taken = {
            let mut inner = self.lock_inner();
            Self::settle_to_empty(
                &mut inner,
                serial,
                generation,
                &[Phase::Starting, Phase::Live],
            )
        };
        if let Some(mut slot) = taken {
            slot.cancel.cancel();
            // capture_handle 属于当前调用者（本任务），不能自 join；取出丢弃，随本任务返回结束。
            slot.capture_handle.take();
            let index = slot.index_handle.take();
            let batch = slot.batch_handle.take();
            join_workers(None, index, batch).await;
            self.publish_stopped(serial, generation).await;
            tracing::info!(serial, generation, "采集流结束");
            self.changed.notify_waiters();
        }
    }

    /// 设备生命周期终点：把槽位从 map 移除（Empty 的世代也随之消失）。
    ///
    /// `last_generation` 不再是永久影子——它只在槽位存在期间有意义；设备真正拔掉后
    /// 该 serial 回到「从未采过」（`status` 报 0）。这是唯一清理点。
    pub(crate) fn forget(&self, serial: &str) {
        let mut inner = self.lock_inner();
        if let Some(slot) = inner.captures.get(serial) {
            debug_assert!(
                slot.phase.is_empty(),
                "只有 Empty 槽位可以被遗忘（{} 是 {}）",
                serial,
                slot.phase.name()
            );
        }
        inner.captures.remove(serial);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn phase_name(phase: Phase) -> &'static str {
        phase.name()
    }

    #[test]
    fn empty_is_explicit_and_carries_last_generation() {
        let empty = Phase::Empty {
            last_generation: 7,
        };
        assert!(empty.is_empty());
        assert!(!empty.occupies());
        assert_eq!(phase_name(empty), "Empty");

        // 三态各自的占用语义
        assert!(Phase::Starting.occupies());
        assert!(Phase::Live.occupies());
        assert!(!Phase::Stopping.occupies(), "Stopping 视为未采集");
        assert!(!Phase::Starting.is_empty());
    }

    /// 四态同构：`settle_to_empty` 把世代写进 Empty，且只在期望相位/世代时成立。
    #[test]
    fn settle_to_empty_records_generation_and_guards_phase() {
        let mut inner = Inner {
            captures: HashMap::new(),
            next_generation: 3,
        };
        inner.captures.insert(
            "S".into(),
            CaptureSlot {
                generation: 3,
                phase: Phase::Live,
                cancel: CancellationToken::new(),
                capture_handle: None,
                index_handle: None,
                batch_handle: None,
            },
        );

        // 相位不符：不转移
        assert!(CaptureSlots::settle_to_empty(&mut inner, "S", 3, &[Phase::Stopping]).is_none());
        // 世代不符：不转移
        assert!(CaptureSlots::settle_to_empty(&mut inner, "S", 2, &[Phase::Live]).is_none());
        assert_eq!(inner.captures["S"].phase, Phase::Live);

        // 相位与世代都对：转移成 Empty 并记住世代
        let settled = CaptureSlots::settle_to_empty(&mut inner, "S", 3, &[Phase::Live])
            .expect("应转移");
        assert_eq!(settled.generation, 3);
        assert_eq!(
            inner.captures["S"].phase,
            Phase::Empty { last_generation: 3 }
        );
        assert!(inner.captures["S"].capture_handle.is_none());

        // 已 Empty：再次转移不成立（Stopped 至多一次）
        assert!(CaptureSlots::settle_to_empty(&mut inner, "S", 3, &[Phase::Live]).is_none());
    }

    /// P2-6：Empty 槽位允许显式存在（携带 `last_generation`），但不得持有任何句柄。
    /// 该断言与 `settle_to_empty` 的实现一致，不再自相矛盾。
    #[test]
    fn empty_slot_invariant_allows_explicit_empty_without_handles() {
        let slot = CaptureSlot {
            generation: 5,
            phase: Phase::Empty { last_generation: 5 },
            cancel: CancellationToken::new(),
            capture_handle: None,
            index_handle: None,
            batch_handle: None,
        };
        // debug 构建下会执行 debug_assert：Empty + 无句柄必须通过。
        slot.check_invariants("S");
    }

    /// Empty 的世代单调：同一 serial 重新开始只会拿到更大的世代。
    #[test]
    fn empty_generation_is_monotonic_across_cycles() {
        let mut inner = Inner {
            captures: HashMap::new(),
            next_generation: 0,
        };
        let mut last = 0u64;
        for _ in 0..5 {
            inner.next_generation += 1;
            let generation = inner.next_generation;
            inner.captures.insert(
                "S".into(),
                CaptureSlot {
                    generation,
                    phase: Phase::Live,
                    cancel: CancellationToken::new(),
                    capture_handle: None,
                    index_handle: None,
                    batch_handle: None,
                },
            );
            let settled = CaptureSlots::settle_to_empty(&mut inner, "S", generation, &[Phase::Live])
                .expect("转移");
            let Phase::Empty { last_generation } = inner.captures["S"].phase else {
                panic!("必须是 Empty");
            };
            assert_eq!(last_generation, settled.generation);
            assert!(last_generation > last, "Empty 世代必须单调递增");
            last = last_generation;
        }
        inner.check_generation_monotonic();
    }
}
