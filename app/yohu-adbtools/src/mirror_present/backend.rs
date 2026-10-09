//! 投屏呈现后端契约（ADR-v6-028）。
//!
//! 编译期选一个 OS 后端。禁止 FFmpeg / libavcodec / ffmpeg.exe。
//! GPU 纹理类型是关联类型，不进本模块。

use std::sync::mpsc::{RecvTimeoutError, Sender, TryRecvError};
use std::sync::{Arc, Mutex};

use yohu_mirror::FramePipe;
use yohu_protocol::{AppEvent, MirrorLayout, MirrorPointerKind, PresentBindState};

use super::stage_copy::present_unavailable_copy;
use super::PresentError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Caps {
    pub id: &'static str,
    pub hevc: bool,
}

pub enum Cmd {
    Layout(MirrorLayout),
    BindPipe {
        serial: String,
        generation: u64,
        /// macOS 表面仍用此管道建 DecodeBind；Windows 解码座已持有同一 `Arc`。
        #[allow(dead_code)]
        pipe: std::sync::Arc<FramePipe>,
    },
    UnbindPipe {
        serial: String,
    },
    /// session 内容宽高。占用 / 描边 / dest 只认这个，不认硬解纹理。
    AdoptContent {
        width: u32,
        height: u32,
    },
    Screenshot {
        path: String,
        reply: Sender<Result<(), PresentError>>,
    },
    Pointer {
        kind: MirrorPointerKind,
        x: i32,
        y: i32,
    },
    Shutdown,
}

/// 表面轮询命令通道的结果。关闭和断开都是停，超时和空队列都是空闲。
pub enum SurfacePoll {
    Stop,
    Idle,
    Ready(Cmd),
}

pub fn poll_timeout(result: Result<Cmd, RecvTimeoutError>) -> SurfacePoll {
    match result {
        Ok(Cmd::Shutdown) | Err(RecvTimeoutError::Disconnected) => SurfacePoll::Stop,
        Err(RecvTimeoutError::Timeout) => SurfacePoll::Idle,
        Ok(cmd) => SurfacePoll::Ready(cmd),
    }
}

pub fn poll_ready(result: Result<Cmd, TryRecvError>) -> SurfacePoll {
    match result {
        Ok(Cmd::Shutdown) | Err(TryRecvError::Disconnected) => SurfacePoll::Stop,
        Err(TryRecvError::Empty) => SurfacePoll::Idle,
        Ok(cmd) => SurfacePoll::Ready(cmd),
    }
}

/// Annex-B 直播解码器。`Picture` / `Bind` 由后端自定，禁止在本 trait 上摊成 packed NV12。
///
/// Windows 热路径故意走 `MfDecoder` 固有方法，不为跨平台上 vtable。
#[allow(dead_code)]
pub trait AnnexBDecoder: Sized {
    type Picture;
    type Bind;

    fn open(hevc: bool, width: u32, height: u32, bind: Option<&Self::Bind>)
        -> Result<Self, String>;

    fn width(&self) -> u32;
    fn height(&self) -> u32;

    fn feed(&mut self, annexb: &[u8], keyframe: bool) -> Result<Option<Self::Picture>, String>;

    fn drain(&mut self) -> Result<Option<Self::Picture>, String>;
}

/// 壳内呈现绑定。与会话相位并列。Windows / macOS 的像素时钟仍是 `Stage.bound`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PresentBind {
    Idle,
    Failed(PresentError),
    Loading,
    Video,
    Paused,
}

impl PresentBind {
    pub fn wire(&self) -> PresentBindState {
        match self {
            Self::Idle => PresentBindState::Idle,
            Self::Failed(_) => PresentBindState::Failed,
            Self::Loading => PresentBindState::Loading,
            Self::Video => PresentBindState::Video,
            Self::Paused => PresentBindState::Paused,
        }
    }

    pub fn hole(&self) -> (String, String) {
        match self {
            Self::Failed(err) => {
                let (title, body) = present_unavailable_copy(&err.to_string());
                (title.to_string(), body)
            }
            _ => (String::new(), String::new()),
        }
    }
}

/// 无原生表面的 BindPipe 失败关闭。有原生表面的成功绑定进入 Loading，首帧再进 Video。
pub fn bind_after_pipe(native_surface: bool) -> PresentBind {
    if native_surface {
        PresentBind::Loading
    } else {
        PresentBind::Failed(PresentError::Unimplemented)
    }
}

pub fn bind_after_frame(paused: bool) -> PresentBind {
    if paused {
        PresentBind::Paused
    } else {
        PresentBind::Video
    }
}

#[cfg_attr(any(windows, target_os = "macos"), allow(dead_code))]
pub(crate) fn unimplemented_screenshot_err() -> PresentError {
    PresentError::Unimplemented
}

fn publish_bind(
    slot: &Mutex<PresentBind>,
    next: PresentBind,
    events: &Option<tokio::sync::mpsc::Sender<AppEvent>>,
    serial: &str,
) {
    let (bind, hole_title, hole_body) = {
        let mut guard = slot.lock().expect("present bind poisoned");
        *guard = next;
        let bind = guard.wire();
        let (hole_title, hole_body) = guard.hole();
        (bind, hole_title, hole_body)
    };
    if let Some(tx) = events {
        let _ = tx.blocking_send(AppEvent::MirrorPresent {
            serial: serial.to_string(),
            bind,
            hole_title,
            hole_body,
        });
    }
}

#[cfg_attr(any(windows, target_os = "macos"), allow(dead_code))]
pub fn spawn_unimplemented(
    id: &'static str,
    serial: &str,
    bind: Arc<Mutex<PresentBind>>,
    events: Option<tokio::sync::mpsc::Sender<AppEvent>>,
) -> Sender<Cmd> {
    let (tx, rx) = std::sync::mpsc::channel();
    let label = format!("mirror-present-{id}-{serial}");
    let serial = serial.to_string();
    let _ = std::thread::Builder::new().name(label).spawn(move || loop {
        match rx.recv() {
            Ok(Cmd::BindPipe { .. }) => {
                publish_bind(&bind, bind_after_pipe(false), &events, &serial);
            }
            Ok(Cmd::UnbindPipe { .. }) => {
                publish_bind(&bind, PresentBind::Idle, &events, &serial);
            }
            Ok(Cmd::Screenshot { reply, .. }) => {
                let _ = reply.send(Err(unimplemented_screenshot_err()));
            }
            Ok(Cmd::Shutdown) | Err(_) => break,
            Ok(_) => {}
        }
    });
    tx
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::{unimplemented_screenshot_err, Cmd};
    use crate::mirror_present::PresentError;

    #[test]
    fn unimplemented_screenshot_is_its_own_category() {
        let err = unimplemented_screenshot_err();
        assert_eq!(err, PresentError::Unimplemented);
        assert_eq!(err.to_string(), "当前平台没有投屏硬解");

        let bind = Arc::new(Mutex::new(super::PresentBind::Idle));
        let (event_tx, mut event_rx) = tokio::sync::mpsc::channel(4);
        let tx = super::spawn_unimplemented("none", "S1", Arc::clone(&bind), Some(event_tx));
        tx.send(Cmd::Pointer {
            kind: yohu_protocol::MirrorPointerKind::Leave,
            x: 0,
            y: 0,
        })
        .expect("pointer");
        std::thread::sleep(std::time::Duration::from_millis(30));
        assert_eq!(
            *bind.lock().expect("present bind poisoned"),
            super::PresentBind::Idle
        );
        tx.send(Cmd::BindPipe {
            serial: "S1".into(),
            generation: 2,
            pipe: yohu_mirror::FramePipe::new(),
        })
        .expect("bind");
        let present = event_rx.blocking_recv().expect("present event");
        match present {
            yohu_protocol::AppEvent::MirrorPresent {
                serial,
                bind: wire,
                hole_title,
                hole_body,
            } => {
                assert_eq!(serial, "S1");
                assert_eq!(wire, yohu_protocol::PresentBindState::Failed);
                assert_eq!(hole_title, "没有画面");
                assert_eq!(hole_body, "当前平台没有投屏硬解");
                assert_ne!(hole_title, "未开始");
            }
            other => panic!("expected present bind, got {other:?}"),
        }
        assert_eq!(
            *bind.lock().expect("present bind poisoned"),
            super::PresentBind::Failed(PresentError::Unimplemented)
        );
        tx.send(Cmd::UnbindPipe {
            serial: "S1".into(),
        })
        .expect("unbind");
        let cleared = event_rx.blocking_recv().expect("clear");
        match cleared {
            yohu_protocol::AppEvent::MirrorPresent {
                bind: wire,
                hole_title,
                ..
            } => {
                assert_eq!(wire, yohu_protocol::PresentBindState::Idle);
                assert!(hole_title.is_empty());
            }
            other => panic!("expected idle bind, got {other:?}"),
        }
        let (reply_tx, reply_rx) = std::sync::mpsc::channel();
        tx.send(Cmd::Screenshot {
            path: String::new(),
            reply: reply_tx,
        })
        .expect("unimplemented thread");
        let reply = reply_rx
            .recv_timeout(std::time::Duration::from_secs(2))
            .expect("screenshot reply");
        let err = reply.expect_err("unimplemented must fail");
        assert_eq!(err, PresentError::Unimplemented);
        assert_eq!(
            super::bind_after_pipe(true),
            super::PresentBind::Loading
        );
        assert_eq!(super::bind_after_frame(false), super::PresentBind::Video);
        assert_eq!(super::bind_after_frame(true), super::PresentBind::Paused);
        let _ = tx.send(Cmd::Shutdown);
    }

    #[test]
    fn command_poll_stops_on_shutdown_and_idle_is_not_a_command() {
        use super::{poll_ready, poll_timeout, SurfacePoll};
        use yohu_protocol::MirrorPointerKind;
        let (tx, rx) = std::sync::mpsc::channel();
        assert!(matches!(poll_ready(rx.try_recv()), SurfacePoll::Idle));
        tx.send(Cmd::Pointer {
            kind: MirrorPointerKind::Leave,
            x: 1,
            y: 2,
        })
        .expect("send");
        assert!(matches!(poll_ready(rx.try_recv()), SurfacePoll::Ready(_)));
        tx.send(Cmd::Shutdown).expect("shutdown");
        assert!(matches!(poll_ready(rx.try_recv()), SurfacePoll::Stop));
        drop(tx);
        assert!(matches!(poll_ready(rx.try_recv()), SurfacePoll::Stop));

        let (tx, rx) = std::sync::mpsc::channel();
        assert!(matches!(
            poll_timeout(rx.recv_timeout(std::time::Duration::from_millis(5))),
            SurfacePoll::Idle
        ));
        drop(tx);
        assert!(matches!(
            poll_timeout(rx.recv_timeout(std::time::Duration::from_millis(5))),
            SurfacePoll::Stop
        ));
        let windows = include_str!("windows/surface.rs");
        let macos = include_str!("macos/surface.rs");
        assert!(!windows.contains("RecvTimeoutError::"));
        assert!(!macos.contains("RecvTimeoutError::"));
        assert!(!windows.contains("TryRecvError::"));
        assert!(!macos.contains("TryRecvError::"));
    }

    #[test]
    fn empty_extent_only_in_content_size_usable() {
        let needles = ["width == 0 || height == 0", "cw == 0 || ch == 0"];
        let files = [
            include_str!("../../../../core/yohu-mirror/src/demux.rs"),
            include_str!("mod.rs"),
            include_str!("macos/vt.rs"),
            include_str!("windows/mf.rs"),
            include_str!("windows/gpu.rs"),
        ];
        let own = include_str!("backend.rs");
        for src in files {
            let scanned = src.replace(own, "");
            for needle in needles {
                assert!(!scanned.contains(needle), "{needle}");
            }
        }
    }

    #[test]
    fn present_lock_sentence_once() {
        let owner = "mutex.lock().expect(\"present lock poisoned\")";
        let needle = "present lock poisoned";
        let host = include_str!("mod.rs");
        let surface = include_str!("macos/surface.rs");
        let scanned = format!("{host}{surface}").replacen(owner, "", 1);
        assert!(!scanned.contains(needle), "{needle}");
        assert!(host.contains("present d3d lock poisoned"));
    }

    #[test]
    fn present_thread_spawn_once() {
        let format_needle = "format!(\"mirror-present-{serial}\")";
        let spawn_needle = "spawn present thread";
        let host = include_str!("mod.rs");
        let windows = include_str!("windows/surface.rs");
        let macos = include_str!("macos/surface.rs");
        let host_production = host
            .split_once("mod tests")
            .map(|(head, _)| head)
            .unwrap_or(host);
        assert_eq!(host_production.matches(format_needle).count(), 1);
        assert_eq!(host_production.matches(spawn_needle).count(), 1);
        for src in [windows, macos] {
            let production = src
                .split_once("mod tests")
                .map(|(head, _)| head)
                .unwrap_or(src);
            assert_eq!(production.matches(format_needle).count(), 0);
            assert_eq!(production.matches(spawn_needle).count(), 0);
        }
    }
}
