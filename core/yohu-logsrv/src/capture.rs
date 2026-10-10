//! 设备级采集槽位编排：Empty → Starting(gen) → Live(gen) → Stopping(gen) → Empty。
//!
//! 槽位 = 采集意图（代际令牌、Batcher、环、进程索引）。跟流工人在 `follow::supervise_follow`。
//! 工人退出不得拆代际资源、不得发 Stopped；Stopped 只来自末 hold 的 stop / 掉线 / Starting 放弃。
//! start 仅对 Live **adopt**；Starting/Stopping 等待后再决定。新流才 `ring.clear()`。
//! 控制面 `CaptureState` 带 generation 且 `send().await` 必达；批次仍 `try_send`。

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::{mpsc, Notify};
use tokio_util::sync::CancellationToken;

use crate::batch::{Batcher, BATCH_FLUSH_INTERVAL, BATCH_MAX_BYTES, BATCH_MAX_LINES};
use crate::follow::{supervise_follow, FollowEnd};
use crate::index::ProcessIndexService;
use crate::ring::RingBuffer;
use crate::task::join_or_abort;
use crate::windows::WindowBook;
use yohu_adb::AdbClient;
use yohu_protocol::{
    AppEvent, CaptureStart, CaptureState, CaptureStatus, LogBatch, LogLatch, LogPage, LogPageQuery,
    LogWindowBind, ProcessEntry, ReplayRequest,
};

#[derive(Debug, thiserror::Error)]
pub enum LogError {
    #[error("采集已取消")]
    Cancelled,
    /// 运输失败。句子就是 `AdbError` 的句子，不再加前缀。
    #[error(transparent)]
    Adb(#[from] yohu_adb::AdbError),
    #[error("导出失败: {0}")]
    Io(#[from] std::io::Error),
    #[error("无法生成导出时间戳")]
    ExportStamp,
    #[error("未指定导出目录")]
    ExportDir,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Phase {
    Starting,
    Live,
    Stopping,
}

struct CaptureSlot {
    generation: u64,
    phase: Phase,
    cancel: CancellationToken,
    capture_handle: Option<tokio::task::JoinHandle<()>>,
    index_handle: Option<tokio::task::JoinHandle<()>>,
}

struct Inner {
    rings: HashMap<String, Arc<RingBuffer>>,
    captures: HashMap<String, CaptureSlot>,
    last_generation: HashMap<String, u64>,
    next_generation: u64,
}

enum StartDecision {
    Adopt(CaptureStart),
    Begin {
        generation: u64,
        cancel: CancellationToken,
    },
    Wait,
}

/// Starting 与 Live 占着采集。Stopping 要等，不在这一把里。
fn phase_occupies(phase: Phase) -> bool {
    matches!(phase, Phase::Starting | Phase::Live)
}

fn phase_is_starting(phase: Phase) -> bool {
    phase == Phase::Starting
}

fn phase_is_stopping(phase: Phase) -> bool {
    phase == Phase::Stopping
}

fn same_generation(slot_generation: u64, expected: u64) -> bool {
    slot_generation == expected
}

async fn join_workers(
    capture: Option<tokio::task::JoinHandle<()>>,
    index: Option<tokio::task::JoinHandle<()>>,
) {
    if let Some(handle) = capture {
        join_or_abort(handle).await;
    }
    if let Some(handle) = index {
        join_or_abort(handle).await;
    }
}

fn remember_and_remove(inner: &mut Inner, serial: &str) -> Option<CaptureSlot> {
    let slot = inner.captures.remove(serial)?;
    inner
        .last_generation
        .insert(serial.to_string(), slot.generation);
    Some(slot)
}

pub struct CaptureService {
    adb: Arc<AdbClient>,
    index: ProcessIndexService,
    sink: mpsc::Sender<AppEvent>,
    windows: Arc<WindowBook>,
    ring_capacity: AtomicUsize,
    inner: Mutex<Inner>,
    changed: Notify,
    /// 应用根取消令牌：每个采集槽位令牌都是它的子令牌。
    /// 退出序列 root_cancel.cancel() 时所有 logcat 采集被取消，adb 子进程经 kill_tree 收敛，避免孤儿化。
    root_cancel: CancellationToken,
}

impl CaptureService {
    fn lock_inner(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().expect("capture lock poisoned")
    }

    pub fn new(
        adb: Arc<AdbClient>,
        sink: mpsc::Sender<AppEvent>,
        ring_capacity: usize,
        root_cancel: CancellationToken,
    ) -> Arc<Self> {
        let index = ProcessIndexService::new(Arc::clone(&adb), sink.clone());
        Arc::new(Self {
            adb,
            index,
            sink,
            windows: Arc::new(WindowBook::new()),
            ring_capacity: AtomicUsize::new(crate::ring::ring_capacity(ring_capacity)),
            inner: Mutex::new(Inner {
                rings: HashMap::new(),
                captures: HashMap::new(),
                last_generation: HashMap::new(),
                next_generation: 0,
            }),
            changed: Notify::new(),
            root_cancel,
        })
    }

    pub fn set_ring_capacity(&self, capacity: usize) {
        self.ring_capacity
            .store(crate::ring::ring_capacity(capacity), Ordering::Relaxed);
    }

    pub(crate) fn ring(&self, serial: &str) -> Arc<RingBuffer> {
        let cap = self.ring_capacity.load(Ordering::Relaxed);
        let mut inner = self.lock_inner();
        inner
            .rings
            .entry(serial.to_string())
            .or_insert_with(|| Arc::new(RingBuffer::new(cap)))
            .clone()
    }

    pub fn replay(&self, req: ReplayRequest) -> LogBatch {
        let ring = self.ring(&req.serial);
        let (lines, truncated) = ring.snapshot_page(req.from_seq, req.limit as usize);
        let from_seq = lines.first().map(|l| l.seq).unwrap_or(req.from_seq);
        LogBatch {
            serial: req.serial,
            from_seq,
            lines,
            truncated,
        }
    }

    pub fn status(&self, serial: &str) -> CaptureStatus {
        let inner = self.lock_inner();
        let (capturing, generation) = match inner.captures.get(serial) {
            Some(slot) if phase_occupies(slot.phase) => {
                (true, slot.generation)
            }
            Some(slot) => (false, slot.generation),
            None => (
                false,
                inner.last_generation.get(serial).copied().unwrap_or(0),
            ),
        };
        let last_seq = inner.rings.get(serial).map(|r| r.last_seq()).unwrap_or(0);
        CaptureStatus {
            serial: serial.to_string(),
            capturing,
            generation,
            last_seq,
        }
    }

    fn decide_start(&self, serial: &str) -> StartDecision {
        let mut inner = self.lock_inner();
        match inner.captures.get(serial) {
            Some(slot) if slot.phase == Phase::Live => StartDecision::Adopt(CaptureStart {
                serial: serial.to_string(),
                generation: slot.generation,
                adopted: true,
            }),
            Some(_) => StartDecision::Wait,
            None => {
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
                    },
                );
                StartDecision::Begin { generation, cancel }
            }
        }
    }

    fn start_must_wait(&self, serial: &str) -> bool {
        let inner = self.lock_inner();
        matches!(
            inner.captures.get(serial),
            Some(slot) if phase_is_starting(slot.phase) || phase_is_stopping(slot.phase)
        )
    }

    /// 开始跟流。仅 Live 可 adopt。Starting/Stopping 等待后再决定。新流跟流前清空本设备环。
    pub async fn start(
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
                    let notified = self.changed.notified();
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

        let ring = self.ring(serial);
        ring.set_capacity(self.ring_capacity.load(Ordering::Relaxed));
        ring.clear();
        self.windows.clear_serial(serial);
        let (batcher, _batch_handle) = Batcher::spawn(
            serial.to_string(),
            self.sink.clone(),
            BATCH_FLUSH_INTERVAL,
            BATCH_MAX_LINES,
            BATCH_MAX_BYTES,
            cancel.clone(),
        );

        // 控制面 Running 先于工人：避免 logcat 批次占满有界 sink 后 start 卡在 send。
        self.emit_state(serial, my_generation, CaptureState::Running)
            .await;
        if cancel.is_cancelled() {
            self.abandon_starting(serial, my_generation).await;
            return Err(LogError::Cancelled);
        }

        let adb = Arc::clone(&self.adb);
        let service = Arc::clone(self);
        let serial_owned = serial.to_string();
        let follow_cancel = cancel.clone();
        let capture_handle = tokio::spawn(async move {
            let end = supervise_follow(
                adb,
                serial_owned.clone(),
                ring,
                Arc::clone(&service.windows),
                batcher,
                follow_cancel,
            )
            .await;
            if matches!(end, FollowEnd::Offline) {
                service
                    .release_if_current(&serial_owned, my_generation)
                    .await;
            }
        });

        let index_handle = self.index.spawn(serial.to_string(), cancel.clone());

        let mut capture_handle = Some(capture_handle);
        let mut index_handle = Some(index_handle);
        let published = {
            let mut inner = self.lock_inner();
            match inner.captures.get_mut(serial) {
                Some(slot) if same_generation(slot.generation, my_generation) && phase_is_starting(slot.phase) => {
                    slot.phase = Phase::Live;
                    slot.capture_handle = capture_handle.take();
                    slot.index_handle = index_handle.take();
                    true
                }
                _ => false,
            }
        };

        if !published {
            cancel.cancel();
            join_workers(capture_handle, index_handle).await;
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

    pub async fn stop(&self, serial: &str) {
        let (generation, cap_h, idx_h) = loop {
            let wait = {
                let mut inner = self.lock_inner();
                match inner.captures.get_mut(serial) {
                    None => return,
                    Some(slot) if phase_is_stopping(slot.phase) => true,
                    Some(slot) => {
                        slot.phase = Phase::Stopping;
                        slot.cancel.cancel();
                        break (
                            slot.generation,
                            slot.capture_handle.take(),
                            slot.index_handle.take(),
                        );
                    }
                }
            };
            if wait {
                let notified = self.changed.notified();
                let still_stopping = {
                    let inner = self.lock_inner();
                    matches!(
                        inner.captures.get(serial),
                        Some(slot) if phase_is_stopping(slot.phase)
                    )
                };
                if still_stopping {
                    notified.await;
                }
            }
        };
        self.changed.notify_waiters();

        join_workers(cap_h, idx_h).await;

        let emit = {
            let mut inner = self.lock_inner();
            let matches = inner
                .captures
                .get(serial)
                .is_some_and(|slot| same_generation(slot.generation, generation) && phase_is_stopping(slot.phase));
            if matches {
                let _ = remember_and_remove(&mut inner, serial);
                true
            } else {
                false
            }
        };
        if emit {
            self.publish_stopped(serial, generation).await;
            tracing::info!(serial, generation, "采集停止");
        } else {
            tracing::info!(serial, generation, "采集停止被更新世代取代，丢弃 Stopped");
        }
        self.changed.notify_waiters();
    }

    pub fn is_capturing(&self, serial: &str) -> bool {
        self.status(serial).capturing
    }

    pub fn clear(&self, serial: &str) {
        let inner = self.lock_inner();
        if let Some(ring) = inner.rings.get(serial) {
            ring.clear();
        }
        self.windows.clear_serial(serial);
    }

    pub fn bind_window(&self, spec: LogWindowBind) -> LogPage {
        let ring = self.ring(&spec.serial);
        self.windows.bind(spec, &ring)
    }

    pub fn release_window(&self, id: u64) {
        self.windows.release(id);
    }

    pub fn latch_window(&self, latch: LogLatch) -> Option<LogPage> {
        let serial = self.windows.serial_of(latch.window_id)?;
        let ring = self.ring(&serial);
        self.windows.latch(latch.window_id, latch.following, &ring)
    }

    pub fn page(&self, query: LogPageQuery) -> Option<LogPage> {
        let serial = self.windows.serial_of(query.window_id)?;
        let ring = self.ring(&serial);
        self.windows.page(query.window_id, query.index, query.count, &ring)
    }

    pub async fn clear_device_buffer(&self, serial: &str) -> Result<(), LogError> {
        self.adb
            .clear_log(serial, self.root_cancel.child_token())
            .await?;
        self.clear(serial);
        Ok(())
    }

    pub async fn detach_device(&self, serial: &str) {
        self.stop(serial).await;
        self.clear(serial);
    }

    pub async fn process_snapshot(&self, serial: &str) -> Result<Vec<ProcessEntry>, LogError> {
        self.index
            .snapshot(serial, self.root_cancel.child_token())
            .await
            .map_err(Into::into)
    }

    /// 已安装包名（新建日志窗口检索；不是当前 `ps` 进程）。
    pub async fn package_snapshot(&self, serial: &str) -> Result<Vec<String>, LogError> {
        self.adb
            .list_packages(serial, self.root_cancel.child_token())
            .await
            .map_err(Into::into)
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
        let dropped = {
            let mut inner = self.lock_inner();
            let matches = inner
                .captures
                .get(serial)
                .is_some_and(|slot| same_generation(slot.generation, generation) && phase_is_starting(slot.phase));
            if matches {
                let _ = remember_and_remove(&mut inner, serial);
                true
            } else {
                false
            }
        };
        if dropped {
            self.publish_stopped(serial, generation).await;
            tracing::info!(serial, generation, "采集 Starting 已放弃");
            self.changed.notify_waiters();
        }
    }

    async fn release_if_current(&self, serial: &str, generation: u64) {
        let taken = {
            let mut inner = self.lock_inner();
            let matches = inner.captures.get(serial).is_some_and(|slot| {
                same_generation(slot.generation, generation) && phase_occupies(slot.phase)
            });
            if matches {
                remember_and_remove(&mut inner, serial)
            } else {
                None
            }
        };
        if let Some(slot) = taken {
            slot.cancel.cancel();
            self.publish_stopped(serial, generation).await;
            tracing::info!(serial, generation, "采集流结束");
            self.changed.notify_waiters();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::LogError;
    use yohu_adb::AdbError;

    #[test]
    fn adb_display_is_the_transport_sentence() {
        let err = LogError::Adb(AdbError::ToolUnavailable);
        assert_eq!(err.to_string(), AdbError::ToolUnavailable.to_string());
        assert!(!err.to_string().contains("采集失败"));
    }

    #[test]
    fn ring_lock_sentence_once() {
        let owner_line = "self.inner.lock().expect(\"ring lock poisoned\")";
        let needle = "ring lock poisoned";
        let src = include_str!("ring.rs");
        let scanned = match src.split_once("mod tests") {
            Some((body, tests)) => format!("{body}{}", tests.replace(needle, "")),
            None => src.to_string(),
        };
        let scanned = scanned.replacen(owner_line, "", 1);
        assert!(!scanned.contains(needle), "{needle}");
    }
}
