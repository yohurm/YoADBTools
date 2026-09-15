//! 每设备一路投屏：Empty / Starting / Live / Stopping + generation（对标 CaptureService）。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tokio::sync::{mpsc, Notify};
use tokio_util::sync::CancellationToken;
use yohu_adb::AdbClient;
use yohu_protocol::{AppEvent, MirrorControlMessage, MirrorSessionState, MirrorStart};

use crate::codec::{self, hevc_should_fallback};
use crate::consts::CONTROL_CHAN;
use crate::control::ControlCmd;
use crate::emit;
use crate::error::MirrorError;
use crate::frame::FramePipe;
use crate::session::{self, MirrorSessionRequest, SessionOpts};
use crate::slot::{self, Phase, StartAction};
use crate::tunnel::{self, WarmTunnel};
use crate::warm::{self, TakeStep, WarmEntry};

struct MirrorSlot {
    generation: u64,
    phase: Phase,
    cancel: CancellationToken,
    handle: Option<tokio::task::JoinHandle<()>>,
    control_tx: Option<mpsc::Sender<ControlCmd>>,
    control: bool,
    frames: Arc<FramePipe>,
}

struct Inner {
    slots: HashMap<String, MirrorSlot>,
    next_generation: u64,
    warm: HashMap<String, WarmEntry>,
}

enum StartDecision {
    Adopt(MirrorStart),
    Begin {
        generation: u64,
        cancel: CancellationToken,
        control_rx: mpsc::Receiver<ControlCmd>,
        frames: Arc<FramePipe>,
    },
    Wait,
}

fn take_slot(inner: &mut Inner, serial: &str) -> Option<MirrorSlot> {
    let slot = inner.slots.remove(serial)?;
    slot.frames.close();
    Some(slot)
}

pub struct MirrorService {
    adb: Arc<AdbClient>,
    sink: mpsc::Sender<AppEvent>,
    server_path: PathBuf,
    inner: Mutex<Inner>,
    changed: Notify,
    root_cancel: CancellationToken,
}

impl MirrorService {
    pub fn new(
        adb: Arc<AdbClient>,
        sink: mpsc::Sender<AppEvent>,
        server_path: PathBuf,
        root_cancel: CancellationToken,
    ) -> Arc<Self> {
        Arc::new(Self {
            adb,
            sink,
            server_path,
            inner: Mutex::new(Inner {
                slots: HashMap::new(),
                next_generation: 0,
                warm: HashMap::new(),
            }),
            changed: Notify::new(),
            root_cancel,
        })
    }

    fn decide_start(&self, serial: &str) -> StartDecision {
        let mut inner = self.inner.lock().expect("mirror lock poisoned");
        match slot::start_action(inner.slots.get(serial).map(|s| s.phase)) {
            StartAction::Adopt => {
                let slot = inner.slots.get(serial).expect("Live slot");
                StartDecision::Adopt(MirrorStart {
                    serial: serial.to_string(),
                    generation: slot.generation,
                    adopted: true,
                })
            }
            StartAction::Wait => StartDecision::Wait,
            StartAction::Begin => {
                inner.next_generation += 1;
                let generation = inner.next_generation;
                let cancel = self.root_cancel.child_token();
                let (control_tx, control_rx) = mpsc::channel(CONTROL_CHAN);
                let frames = FramePipe::new();
                inner.slots.insert(
                    serial.to_string(),
                    MirrorSlot {
                        generation,
                        phase: Phase::Starting,
                        cancel: cancel.clone(),
                        handle: None,
                        control_tx: Some(control_tx),
                        control: false,
                        frames: Arc::clone(&frames),
                    },
                );
                StartDecision::Begin {
                    generation,
                    cancel,
                    control_rx,
                    frames,
                }
            }
        }
    }

    fn start_must_wait(&self, serial: &str) -> bool {
        let inner = self.inner.lock().expect("mirror lock poisoned");
        slot::start_must_wait(inner.slots.get(serial).map(|s| s.phase))
    }

    pub fn frame_pipe(&self, serial: &str) -> Option<Arc<FramePipe>> {
        self.inner
            .lock()
            .expect("mirror lock poisoned")
            .slots
            .get(serial)
            .map(|slot| Arc::clone(&slot.frames))
    }

    pub async fn start(
        self: &Arc<Self>,
        req: MirrorSessionRequest,
    ) -> Result<MirrorStart, MirrorError> {
        let serial = req.serial.clone();
        let (my_generation, cancel, control_rx, frames) = loop {
            match self.decide_start(&serial) {
                StartDecision::Adopt(result) => {
                    tracing::info!(
                        serial = %serial,
                        generation = result.generation,
                        "投屏 adopt（已在 Live）"
                    );
                    return Ok(result);
                }
                StartDecision::Begin {
                    generation,
                    cancel,
                    control_rx,
                    frames,
                } => {
                    self.changed.notify_waiters();
                    break (generation, cancel, control_rx, frames);
                }
                StartDecision::Wait => {
                    let notified = self.changed.notified();
                    if self.start_must_wait(&serial) {
                        notified.await;
                    }
                }
            }
        };

        emit::emit_terminal_state(
            &self.sink,
            &serial,
            my_generation,
            MirrorSessionState::Starting,
            None,
        )
        .await;

        {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            if let Some(slot) = inner.slots.get_mut(&serial) {
                if slot::can_mark_live(slot.phase, slot.generation, my_generation) {
                    slot.control = req.control;
                    if !req.control {
                        slot.control_tx = None;
                    }
                }
            }
        }

        if cancel.is_cancelled() {
            self.abandon_starting(&serial, my_generation).await;
            return Err(MirrorError::Cancelled);
        }

        let service = Arc::clone(self);
        let serial_owned = serial.clone();
        let follow_cancel = cancel.clone();
        let handle = tokio::spawn(async move {
            service
                .drive_session(
                    serial_owned,
                    my_generation,
                    follow_cancel,
                    req,
                    Some(control_rx),
                    frames,
                )
                .await;
        });

        let mut handle = Some(handle);
        let published = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            match inner.slots.get_mut(&serial) {
                Some(slot)
                    if slot::can_publish_handle(slot.phase, slot.generation, my_generation) =>
                {
                    slot.handle = handle.take();
                    true
                }
                _ => false,
            }
        };
        if !published {
            cancel.cancel();
            if let Some(h) = handle {
                let _ = h.await;
            }
            return Err(MirrorError::Cancelled);
        }
        self.changed.notify_waiters();
        Ok(MirrorStart {
            serial,
            generation: my_generation,
            adopted: false,
        })
    }

    async fn drive_session(
        self: &Arc<Self>,
        serial: String,
        generation: u64,
        cancel: CancellationToken,
        mut req: MirrorSessionRequest,
        mut control_rx: Option<mpsc::Receiver<ControlCmd>>,
        frames: Arc<FramePipe>,
    ) {
        let requested_h265 = matches!(
            codec::VideoCodec::from_name(&req.video_codec),
            Ok(codec::VideoCodec::H265)
        );
        let mut tried_h264 = false;
        let mut warm = self.take_warm(&serial, req.force_forward, &cancel).await;
        let result = loop {
            let rx = match control_rx.take() {
                Some(rx) => rx,
                None => self.new_control_rx(&serial, generation),
            };
            let live_service = Arc::clone(self);
            let live_serial = serial.clone();
            let attempt_cancel = cancel.child_token();
            let result = session::run_session(
                Arc::clone(&self.adb),
                self.sink.clone(),
                attempt_cancel,
                generation,
                SessionOpts {
                    req: req.clone(),
                    server_path: self.server_path.clone(),
                    frames: Arc::clone(&frames),
                    warm: warm.take(),
                },
                rx,
                move || {
                    live_service.mark_live(&live_serial, generation);
                },
            )
            .await;
            if !cancel.is_cancelled()
                && self.slot_still_starting(&serial, generation)
                && result
                    .as_ref()
                    .err()
                    .is_some_and(|e| hevc_should_fallback(requested_h265, tried_h264, e))
            {
                tracing::warn!(
                    serial = %serial,
                    generation,
                    "HEVC 失败，同会话回退 H.264"
                );
                frames.reset_content();
                req.video_codec = codec::NAME_H264.into();
                tried_h264 = true;
                continue;
            }
            break result;
        };
        self.release_if_current(&serial, generation, result).await;
    }

    fn mark_live(&self, serial: &str, generation: u64) {
        let mut inner = self.inner.lock().expect("mirror lock poisoned");
        if let Some(slot) = inner.slots.get_mut(serial) {
            if slot::can_mark_live(slot.phase, slot.generation, generation) {
                slot.phase = Phase::Live;
            }
        }
        self.changed.notify_waiters();
    }

    pub async fn stop(&self, serial: &str) {
        let (generation, handle) = loop {
            let wait = {
                let mut inner = self.inner.lock().expect("mirror lock poisoned");
                match inner.slots.get_mut(serial) {
                    None => return,
                    Some(slot) if slot::is_stopping(Some(slot.phase)) => true,
                    Some(slot) => {
                        slot.phase = Phase::Stopping;
                        slot.cancel.cancel();
                        slot.frames.close();
                        slot.control_tx = None;
                        break (slot.generation, slot.handle.take());
                    }
                }
            };
            if wait {
                let notified = self.changed.notified();
                let still_stopping = {
                    let inner = self.inner.lock().expect("mirror lock poisoned");
                    slot::is_stopping(inner.slots.get(serial).map(|s| s.phase))
                };
                if still_stopping {
                    notified.await;
                }
            }
        };
        self.changed.notify_waiters();
        if let Some(handle) = handle {
            let _ = handle.await;
        }
        let emit = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            let matches = inner.slots.get(serial).is_some_and(|slot| {
                slot::can_emit_stopped(slot.phase, slot.generation, generation)
            });
            if matches {
                let _ = take_slot(&mut inner, serial);
                true
            } else {
                false
            }
        };
        if emit {
            emit::emit_terminal_state(
                &self.sink,
                serial,
                generation,
                MirrorSessionState::Stopped,
                None,
            )
            .await;
            tracing::info!(serial, generation, "投屏停止");
        }
        self.changed.notify_waiters();
    }

    pub async fn stop_all(&self) {
        let (slot_serials, warm_serials): (Vec<String>, Vec<String>) = {
            let inner = self.inner.lock().expect("mirror lock poisoned");
            (
                inner.slots.keys().cloned().collect(),
                inner.warm.keys().cloned().collect(),
            )
        };
        for serial in slot_serials {
            self.stop(&serial).await;
        }
        for serial in warm_serials {
            self.drop_warm(&serial).await;
        }
    }

    pub async fn inject(
        &self,
        serial: &str,
        message: MirrorControlMessage,
    ) -> Result<(), MirrorError> {
        let tx = {
            let inner = self.inner.lock().expect("mirror lock poisoned");
            match inner.slots.get(serial) {
                Some(slot) if slot::is_live(Some(slot.phase)) => slot.control_tx.clone(),
                Some(_) | None => return Err(MirrorError::NotLive),
            }
        };
        let Some(tx) = tx else {
            return Err(MirrorError::NoControl);
        };
        tx.send(ControlCmd::Send(crate::control::encode(&message)))
            .await
            .map_err(|_| MirrorError::NoControl)
    }

    pub fn close_control(&self, serial: &str) -> Result<(), MirrorError> {
        let tx = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            match inner.slots.get_mut(serial) {
                Some(slot) if slot::is_live(Some(slot.phase)) => {
                    slot.control = false;
                    slot.control_tx.take()
                }
                Some(_) | None => return Err(MirrorError::NotLive),
            }
        };
        if let Some(tx) = tx {
            let _ = tx.try_send(ControlCmd::Close);
        }
        Ok(())
    }

    async fn abandon_starting(&self, serial: &str, generation: u64) {
        let dropped = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            let matches = inner
                .slots
                .get(serial)
                .is_some_and(|slot| slot::can_abandon(slot.phase, slot.generation, generation));
            if matches {
                let _ = take_slot(&mut inner, serial);
                true
            } else {
                false
            }
        };
        if dropped {
            emit::emit_terminal_state(
                &self.sink,
                serial,
                generation,
                MirrorSessionState::Stopped,
                None,
            )
            .await;
            self.changed.notify_waiters();
        }
    }

    async fn release_if_current(
        &self,
        serial: &str,
        generation: u64,
        result: Result<(), MirrorError>,
    ) {
        let taken = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            let matches = inner
                .slots
                .get(serial)
                .is_some_and(|slot| slot::can_release(slot.phase, slot.generation, generation));
            if matches {
                take_slot(&mut inner, serial)
            } else {
                None
            }
        };
        if taken.is_some() {
            let (state, error) = match result {
                Ok(()) | Err(MirrorError::Cancelled) => (MirrorSessionState::Stopped, None),
                Err(e) => {
                    tracing::error!(serial, generation, error = %e, "投屏流失败");
                    (MirrorSessionState::Failed, Some(e.to_string()))
                }
            };
            emit::emit_terminal_state(&self.sink, serial, generation, state, error).await;
            tracing::info!(serial, generation, "投屏流结束");
            self.changed.notify_waiters();
        }
    }

    fn slot_still_starting(&self, serial: &str, generation: u64) -> bool {
        let inner = self.inner.lock().expect("mirror lock poisoned");
        inner
            .slots
            .get(serial)
            .is_some_and(|slot| slot::still_starting(slot.phase, slot.generation, generation))
    }

    fn new_control_rx(&self, serial: &str, generation: u64) -> mpsc::Receiver<ControlCmd> {
        let (tx, rx) = mpsc::channel(CONTROL_CHAN);
        let mut inner = self.inner.lock().expect("mirror lock poisoned");
        if let Some(slot) = inner.slots.get_mut(serial) {
            if slot.generation == generation && slot.control {
                slot.control_tx = Some(tx);
            }
        }
        rx
    }

    /// 设备扫描成功后对在线设备后台预热（跳过 push + 预挂隧道）。
    pub async fn warmup(self: &Arc<Self>, serial: &str, force_forward: bool) {
        let cancel = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            if inner.slots.contains_key(serial) {
                return;
            }
            match inner.warm.get(serial) {
                Some(WarmEntry::Busy { .. } | WarmEntry::Ready { .. }) => return,
                None => {
                    let cancel = self.root_cancel.child_token();
                    inner.warm.insert(
                        serial.to_string(),
                        WarmEntry::Busy {
                            cancel: cancel.clone(),
                            force_forward,
                        },
                    );
                    self.changed.notify_waiters();
                    cancel
                }
            }
        };
        let result = tunnel::warmup(
            &self.adb,
            serial,
            &self.server_path,
            force_forward,
            cancel.clone(),
        )
        .await;
        let stale = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            let slot_live = inner
                .slots
                .get(serial)
                .is_some_and(|slot| slot::is_live(Some(slot.phase)));
            warm::commit_warmup(
                &mut inner.warm,
                serial,
                result,
                cancel.is_cancelled(),
                slot_live,
            )
        };
        if let Some(tunnel) = stale {
            tunnel.drop_async(&self.adb, serial).await;
        }
        self.changed.notify_waiters();
    }

    pub async fn drop_warm(&self, serial: &str) {
        let taken = {
            let mut inner = self.inner.lock().expect("mirror lock poisoned");
            inner.warm.remove(serial)
        };
        match taken {
            Some(WarmEntry::Ready { tunnel, .. }) => {
                tunnel.drop_async(&self.adb, serial).await;
            }
            Some(WarmEntry::Busy { cancel, .. }) => {
                cancel.cancel();
            }
            None => {}
        }
        self.changed.notify_waiters();
    }

    async fn take_warm(
        &self,
        serial: &str,
        force_forward: bool,
        cancel: &CancellationToken,
    ) -> Option<WarmTunnel> {
        loop {
            let step = {
                let mut inner = self.inner.lock().expect("mirror lock poisoned");
                warm::take_warm_step(&mut inner.warm, serial, force_forward)
            };
            match step {
                TakeStep::Ready(t) => {
                    self.changed.notify_waiters();
                    return Some(t);
                }
                TakeStep::Mismatch(t) => {
                    t.drop_async(&self.adb, serial).await;
                    self.changed.notify_waiters();
                    return None;
                }
                TakeStep::Miss => return None,
                TakeStep::Wait => {
                    let notified = self.changed.notified();
                    let still_busy = {
                        let inner = self.inner.lock().expect("mirror lock poisoned");
                        matches!(inner.warm.get(serial), Some(WarmEntry::Busy { .. }))
                    };
                    if still_busy {
                        tokio::select! {
                            _ = cancel.cancelled() => return None,
                            _ = notified => {}
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codec::PIPE_H264;
    use crate::frame::EncodedFrame;

    fn pipe_open(frames: &FramePipe) -> bool {
        frames.push(EncodedFrame {
            generation: 1,
            width: 8,
            height: 8,
            config: true,
            keyframe: false,
            pts: 1,
            codec: PIPE_H264,
            payload: vec![1],
            dropped: 0,
        });
        frames.try_recv().is_some()
    }

    #[test]
    fn first_codec_or_server_failed_keeps_slot_for_second_attempt() {
        for codec_fail in [true, false] {
            let slot = CancellationToken::new();
            let frames = FramePipe::new();
            let requested_h265 = true;
            let mut tried_h264 = false;
            let mut attempts = 0_u8;
            let result = loop {
                attempts += 1;
                let attempt = slot.child_token();
                let result = if attempts == 1 {
                    Err(if codec_fail {
                        MirrorError::Codec("设备视频配置失败".into())
                    } else {
                        MirrorError::ServerFailed("encoder".into())
                    })
                } else {
                    Ok(())
                };
                attempt.cancel();
                if !slot.is_cancelled()
                    && slot::still_starting(Phase::Starting, 1, 1)
                    && result
                        .as_ref()
                        .err()
                        .is_some_and(|e| hevc_should_fallback(requested_h265, tried_h264, e))
                {
                    assert!(pipe_open(&frames));
                    frames.reset_content();
                    assert!(frames.sticky_config().is_none());
                    assert!(frames.try_recv().is_none());
                    tried_h264 = true;
                    continue;
                }
                break result;
            };
            assert!(result.is_ok());
            assert_eq!(attempts, 2);
            assert!(!slot.is_cancelled());
            assert!(pipe_open(&frames));
        }
    }

    fn dummy_adb() -> Arc<AdbClient> {
        Arc::new(AdbClient::new(
            yohu_adb::ToolResolver::new(
                None,
                std::env::temp_dir().join("yohu-mirror-svc-res"),
                std::env::temp_dir().join("yohu-mirror-svc-data"),
            ),
            1,
        ))
    }

    fn test_service() -> Arc<MirrorService> {
        let (sink, _rx) = mpsc::channel(8);
        MirrorService::new(
            dummy_adb(),
            sink,
            PathBuf::from("missing-scrcpy-server"),
            CancellationToken::new(),
        )
    }

    fn test_slot(phase: Phase) -> MirrorSlot {
        MirrorSlot {
            generation: 1,
            phase,
            cancel: CancellationToken::new(),
            handle: None,
            control_tx: None,
            control: false,
            frames: FramePipe::new(),
        }
    }

    fn forward_tunnel() -> WarmTunnel {
        WarmTunnel::Forward { scid: 7, port: 9 }
    }

    #[tokio::test]
    async fn take_warm_waits_busy_then_receives_ready() {
        let svc = test_service();
        let session_cancel = CancellationToken::new();
        let warm_cancel = {
            let mut inner = svc.inner.lock().expect("mirror lock poisoned");
            let cancel = CancellationToken::new();
            inner.slots.insert("S1".into(), test_slot(Phase::Starting));
            inner.warm.insert(
                "S1".into(),
                WarmEntry::Busy {
                    cancel: cancel.clone(),
                    force_forward: false,
                },
            );
            cancel
        };

        let taker = {
            let svc = Arc::clone(&svc);
            let session_cancel = session_cancel.clone();
            tokio::spawn(async move { svc.take_warm("S1", false, &session_cancel).await })
        };

        tokio::task::yield_now().await;
        let stale = {
            let mut inner = svc.inner.lock().expect("mirror lock poisoned");
            let slot_live = inner
                .slots
                .get("S1")
                .is_some_and(|slot| slot::is_live(Some(slot.phase)));
            warm::commit_warmup(
                &mut inner.warm,
                "S1",
                Ok(forward_tunnel()),
                warm_cancel.is_cancelled(),
                slot_live,
            )
        };
        assert!(stale.is_none(), "Starting 槽不得把预热当 stale");
        svc.changed.notify_waiters();

        let got = tokio::time::timeout(std::time::Duration::from_secs(2), taker)
            .await
            .expect("take_warm 应在 Ready 后返回")
            .expect("join");
        let got = got.expect("Starting 等待 Busy 时必须拿到 Ready 隧道");
        assert!(got.used_forward());
        assert_eq!(got.scid(), 7);
    }
}
