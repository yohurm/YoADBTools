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
use yohu_adb::AdbClient;
use yohu_protocol::{
    AppEvent, CaptureStart, CaptureState, CaptureStatus, LogBatch, ProcessEntry, ReplayRequest,
};

#[derive(Debug, thiserror::Error)]
pub enum LogError {
    #[error("采集已取消")]
    Cancelled,
    #[error("采集失败: {0}")]
    Adb(#[from] yohu_adb::AdbError),
    #[error("导出失败: {0}")]
    Io(#[from] std::io::Error),
    #[error("无法生成导出时间戳")]
    ExportStamp,
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
    ring_capacity: AtomicUsize,
    inner: Mutex<Inner>,
    changed: Notify,
    /// 应用根取消令牌：每个采集槽位令牌都是它的子令牌。
    /// 退出序列 root_cancel.cancel() 时所有 logcat 采集被取消，adb 子进程经 kill_tree 收敛，避免孤儿化。
    root_cancel: CancellationToken,
}

impl CaptureService {
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
            ring_capacity: AtomicUsize::new(ring_capacity.max(1)),
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
        self.ring_capacity.store(capacity.max(1), Ordering::Relaxed);
    }

    pub(crate) fn ring(&self, serial: &str) -> Arc<RingBuffer> {
        let cap = self.ring_capacity.load(Ordering::Relaxed);
        let mut inner = self.inner.lock().expect("capture lock poisoned");
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
        let inner = self.inner.lock().expect("capture lock poisoned");
        let (capturing, generation) = match inner.captures.get(serial) {
            Some(slot) if slot.phase == Phase::Starting || slot.phase == Phase::Live => {
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
        let mut inner = self.inner.lock().expect("capture lock poisoned");
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
        let inner = self.inner.lock().expect("capture lock poisoned");
        matches!(
            inner.captures.get(serial),
            Some(slot) if slot.phase == Phase::Starting || slot.phase == Phase::Stopping
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
            let end = supervise_follow(adb, serial_owned.clone(), ring, batcher, follow_cancel).await;
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
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            match inner.captures.get_mut(serial) {
                Some(slot) if slot.generation == my_generation && slot.phase == Phase::Starting => {
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
            if let Some(handle) = capture_handle {
                join_or_abort(handle).await;
            }
            if let Some(handle) = index_handle {
                join_or_abort(handle).await;
            }
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
                let mut inner = self.inner.lock().expect("capture lock poisoned");
                match inner.captures.get_mut(serial) {
                    None => return,
                    Some(slot) if slot.phase == Phase::Stopping => true,
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
                    let inner = self.inner.lock().expect("capture lock poisoned");
                    matches!(
                        inner.captures.get(serial),
                        Some(slot) if slot.phase == Phase::Stopping
                    )
                };
                if still_stopping {
                    notified.await;
                }
            }
        };
        self.changed.notify_waiters();

        if let Some(handle) = cap_h {
            join_or_abort(handle).await;
        }
        if let Some(handle) = idx_h {
            join_or_abort(handle).await;
        }

        let emit = {
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            let matches = inner
                .captures
                .get(serial)
                .is_some_and(|slot| slot.generation == generation && slot.phase == Phase::Stopping);
            if matches {
                let _ = remember_and_remove(&mut inner, serial);
                true
            } else {
                false
            }
        };
        if emit {
            self.emit_state(serial, generation, CaptureState::Stopped)
                .await;
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
        let inner = self.inner.lock().expect("capture lock poisoned");
        if let Some(ring) = inner.rings.get(serial) {
            ring.clear();
        }
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
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            let matches = inner
                .captures
                .get(serial)
                .is_some_and(|slot| slot.generation == generation && slot.phase == Phase::Starting);
            if matches {
                let _ = remember_and_remove(&mut inner, serial);
                true
            } else {
                false
            }
        };
        if dropped {
            self.emit_state(serial, generation, CaptureState::Stopped)
                .await;
            tracing::info!(serial, generation, "采集 Starting 已放弃");
            self.changed.notify_waiters();
        }
    }

    async fn release_if_current(&self, serial: &str, generation: u64) {
        let taken = {
            let mut inner = self.inner.lock().expect("capture lock poisoned");
            let matches = inner.captures.get(serial).is_some_and(|slot| {
                slot.generation == generation
                    && (slot.phase == Phase::Live || slot.phase == Phase::Starting)
            });
            if matches {
                remember_and_remove(&mut inner, serial)
            } else {
                None
            }
        };
        if let Some(slot) = taken {
            slot.cancel.cancel();
            self.emit_state(serial, generation, CaptureState::Stopped)
                .await;
            tracing::info!(serial, generation, "采集流结束");
            self.changed.notify_waiters();
        }
    }
}
