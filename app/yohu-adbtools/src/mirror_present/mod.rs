//! 壳内投屏呈现：编译期系统硬解（ADR-v6-024/026/027/028/030）。
//!
//! Windows = Media Foundation → D3D11 YUV → HWND。
//! macOS = VideoToolbox → NSView。Linux 预留，禁止 FFmpeg。
//! UI 上报稳定可用区；表面独占像素。解码会话跟 `mirror.start`/`stop` 走，表面跟舞台可见性走。

mod annexb;
mod backend;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
mod png;
mod pointer;
mod scale;
mod stage;
mod stage_copy;
mod stage_palette;
#[cfg(windows)]
mod windows;

pub use backend::{AnnexBDecoder, Caps};
#[cfg(windows)]
pub use windows::MfDecoder;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::{FramePipe, MirrorService};
use yohu_protocol::{AppEvent, MirrorLayout, MIRROR_MIN_LAYOUT_PX};

use backend::Cmd;

#[cfg(windows)]
use windows::GeomHost;

/// 呈现侧可映射错误。IPC 码由 `ipc_present` 按变体判定，禁止扫字符串。
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum PresentError {
    #[error("当前没有投屏画面")]
    Empty,
    #[error("截图设备与当前舞台不一致")]
    SerialMismatch,
    #[error("呈现线程已退出")]
    Exited,
    #[error("截图超时")]
    Timeout,
    #[error("{0}")]
    Internal(String),
}

pub struct PresentHost {
    hevc_ok: AtomicBool,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    mirror: Arc<MirrorService>,
    inner: Mutex<Inner>,
    #[cfg(windows)]
    geom: Arc<GeomHost>,
}

struct Inner {
    owner: isize,
    /// 主窗至多一块舞台表面（本期否决多设备同时投屏）。
    surface: Option<Sender<Cmd>>,
    /// 当前舞台 serial；与 `screenshot` 参数对账。
    stage_serial: Option<String>,
    /// 仅工作台在 `screen-mirror` 为当前模块时为 true。淡出中的 View 报 layout 也不得建窗。
    active: bool,
    pending: Option<(String, u64, Arc<FramePipe>)>,
}

pub fn probe() -> Caps {
    #[cfg(windows)]
    {
        Caps {
            id: windows::ID,
            hevc: windows::hevc_available(),
        }
    }
    #[cfg(target_os = "macos")]
    {
        macos::probe()
    }
    #[cfg(target_os = "linux")]
    {
        linux::probe()
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        Caps {
            id: "none",
            hevc: false,
        }
    }
}

impl PresentHost {
    pub fn new(event_tx: tokio_mpsc::Sender<AppEvent>, mirror: Arc<MirrorService>) -> Arc<Self> {
        // HEVC 探测会走 Media Foundation，冷启动可达数秒；禁止挡 setup / 首屏。
        #[cfg(windows)]
        let geom = GeomHost::new();
        let host = Arc::new(Self {
            hevc_ok: AtomicBool::new(false),
            event_tx,
            mirror,
            inner: Mutex::new(Inner {
                owner: 0,
                surface: None,
                stage_serial: None,
                active: false,
                pending: None,
            }),
            #[cfg(windows)]
            geom,
        });
        let probe_host = Arc::clone(&host);
        tauri::async_runtime::spawn(async move {
            match tokio::task::spawn_blocking(probe).await {
                Ok(caps) => {
                    probe_host.hevc_ok.store(caps.hevc, Ordering::SeqCst);
                    tracing::info!(backend = caps.id, hevc_ok = caps.hevc, "投屏后端探测");
                }
                Err(e) => tracing::warn!("投屏后端探测失败: {e}"),
            }
        });
        host
    }

    pub fn hevc_ok(&self) -> bool {
        self.hevc_ok.load(Ordering::SeqCst)
    }

    pub fn set_owner(&self, owner: isize) {
        self.inner.lock().expect("present lock poisoned").owner = owner;
        #[cfg(windows)]
        self.geom.set_owner(owner);
    }

    /// 绑定解码管道。未 active 只 stash；建窗只走 `setActive(true)` 之后的 `layout`。
    pub fn attach(&self, serial: &str, generation: u64, pipe: Arc<FramePipe>) {
        let tx = {
            let mut inner = self.inner.lock().expect("present lock poisoned");
            if let Some(tx) = inner.surface.clone() {
                Some(tx)
            } else {
                inner.pending = Some((serial.to_string(), generation, pipe.clone()));
                None
            }
        };
        if let Some(tx) = tx {
            let _ = tx.send(Cmd::BindPipe {
                serial: serial.to_string(),
                generation,
                pipe,
            });
        }
    }

    /// 停解码、舞台改画 chrome。表面仍在。同 serial 的 pending 丢掉；异 serial 保留。
    pub fn unbind(&self, serial: &str) {
        let mut inner = self.inner.lock().expect("present lock poisoned");
        apply_pending_unbind(&mut inner.pending, serial);
        if let Some(tx) = inner.surface.as_ref() {
            let _ = tx.send(Cmd::UnbindPipe {
                serial: serial.to_string(),
            });
        }
    }

    /// 工作台拥有舞台开关。未激活时一切 `mirror.layout`（含 `visible=true`）丢弃。
    pub fn set_active(&self, active: bool) {
        {
            let mut inner = self.inner.lock().expect("present lock poisoned");
            inner.active = active;
        }
        if active {
            tracing::info!("投屏舞台激活");
        } else {
            tracing::info!("投屏舞台关闭（模块不是投屏）");
            self.shutdown();
        }
    }

    pub fn layout(&self, layout: MirrorLayout) {
        let active = self.inner.lock().expect("present lock poisoned").active;
        if !active {
            tracing::info!(
                serial = %layout.serial,
                visible = layout.visible,
                "投屏 layout 丢弃：舞台未激活"
            );
            return;
        }
        if !layout.visible
            || layout.width < MIRROR_MIN_LAYOUT_PX
            || layout.height < MIRROR_MIN_LAYOUT_PX
        {
            tracing::info!(
                serial = %layout.serial,
                visible = layout.visible,
                w = layout.width,
                h = layout.height,
                "投屏舞台关闭（离开可用区）"
            );
            self.shutdown();
            return;
        }
        if !self.ensure_surface(&layout.serial) {
            return;
        }
        self.flush_pending();
        let tx = {
            let mut inner = self.inner.lock().expect("present lock poisoned");
            inner.stage_serial = Some(layout.serial.clone());
            inner.surface.clone()
        };
        if let Some(tx) = tx {
            let _ = tx.send(Cmd::Layout(layout));
        }
    }

    pub fn screenshot(&self, serial: &str, path: &str) -> Result<(), PresentError> {
        let (reply_tx, reply_rx) = std::sync::mpsc::channel();
        {
            let inner = self.inner.lock().expect("present lock poisoned");
            assert_screenshot_serial(inner.stage_serial.as_deref(), serial)?;
            let tx = inner.surface.as_ref().ok_or(PresentError::Empty)?;
            tx.send(Cmd::Screenshot {
                path: path.to_string(),
                reply: reply_tx,
            })
            .map_err(|_| PresentError::Exited)?;
        }
        reply_rx
            .recv_timeout(crate::limits::SCREENSHOT_TIMEOUT)
            .map_err(|_| PresentError::Timeout)?
    }

    /// 拆表面。只用于离开投屏页或进程退出，禁止跟 `mirror.stop` 绑在一起。
    pub fn shutdown(&self) {
        let tx = {
            let mut inner = self.inner.lock().expect("present lock poisoned");
            apply_pending_shutdown(&mut inner.pending);
            inner.stage_serial = None;
            inner.surface.take()
        };
        if let Some(tx) = tx {
            let _ = tx.send(Cmd::Shutdown);
        }
    }

    fn ensure_surface(&self, serial: &str) -> bool {
        {
            let inner = self.inner.lock().expect("present lock poisoned");
            if inner.surface.is_some() {
                return true;
            }
            if inner.owner == 0 {
                tracing::error!("投屏表面尚未绑定主窗口");
                return false;
            }
        }
        let owner = self.inner.lock().expect("present lock poisoned").owner;
        let tx = spawn_backend_surface(
            serial.to_string(),
            owner,
            Arc::clone(&self.mirror),
            self.event_tx.clone(),
            #[cfg(windows)]
            Arc::clone(&self.geom),
        );
        self.inner.lock().expect("present lock poisoned").surface = Some(tx);
        true
    }

    fn flush_pending(&self) {
        let pending = {
            let mut inner = self.inner.lock().expect("present lock poisoned");
            let tx = inner.surface.clone();
            tx.and_then(|tx| inner.pending.take().map(|p| (tx, p)))
        };
        if let Some((tx, (serial, generation, pipe))) = pending {
            let _ = tx.send(Cmd::BindPipe {
                serial,
                generation,
                pipe,
            });
        }
    }
}

fn assert_screenshot_serial(current: Option<&str>, requested: &str) -> Result<(), PresentError> {
    match current {
        Some(serial) if serial == requested => Ok(()),
        Some(_) => Err(PresentError::SerialMismatch),
        None => Err(PresentError::Empty),
    }
}

/// 无像素 → Empty；写盘失败 → Internal。Host 截图与单测共用，禁止再包一层 Internal。
pub(crate) fn screenshot_from_pixels(
    path: &str,
    pixels: Option<(u32, u32, Vec<u8>)>,
) -> Result<(), PresentError> {
    let (w, h, bgra) = pixels.ok_or(PresentError::Empty)?;
    png::write_bgra_png(path, w, h, &bgra).map_err(PresentError::Internal)
}

/// `with_host` 空：线程已拆 → Exited，不是 Empty。
pub(crate) fn screenshot_host_reply<T>(
    host: Option<Result<T, PresentError>>,
) -> Result<T, PresentError> {
    host.unwrap_or(Err(PresentError::Exited))
}

/// `unbind(serial)`：同 serial 丢掉 pending；异 serial 保留。只看 serial。
fn apply_pending_unbind<P, G>(pending: &mut Option<(String, P, G)>, serial: &str) {
    if pending.as_ref().is_some_and(|(s, ..)| s == serial) {
        pending.take();
    }
}

/// `shutdown`：pending 与表面同一寿命，一律清空。
fn apply_pending_shutdown<T>(pending: &mut Option<T>) {
    *pending = None;
}

fn spawn_backend_surface(
    serial: String,
    owner: isize,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    #[cfg(windows)] geom: Arc<GeomHost>,
) -> Sender<Cmd> {
    #[cfg(windows)]
    {
        windows::spawn_surface(serial, owner, mirror, event_tx, geom)
    }
    #[cfg(target_os = "macos")]
    {
        macos::spawn_surface(serial, owner, mirror, event_tx)
    }
    #[cfg(target_os = "linux")]
    {
        linux::spawn_surface(serial, owner, mirror, event_tx)
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        let _ = (owner, mirror, event_tx);
        backend::spawn_unimplemented("none", &serial)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        apply_pending_shutdown, apply_pending_unbind, assert_screenshot_serial, probe,
        screenshot_from_pixels, screenshot_host_reply, PresentError,
    };

    #[test]
    fn screenshot_rejects_mismatched_serial() {
        assert!(assert_screenshot_serial(Some("A"), "A").is_ok());
        let mismatch = assert_screenshot_serial(Some("A"), "B").unwrap_err();
        assert_eq!(mismatch, PresentError::SerialMismatch);
        assert_eq!(mismatch.to_string(), "截图设备与当前舞台不一致");
        let empty = assert_screenshot_serial(None, "A").unwrap_err();
        assert_eq!(empty, PresentError::Empty);
        assert_eq!(empty.to_string(), "当前没有投屏画面");
    }

    #[test]
    fn screenshot_without_frame_is_empty_not_internal() {
        let err = screenshot_from_pixels("/unused.png", None).unwrap_err();
        assert_eq!(err, PresentError::Empty);
        assert_eq!(err.to_string(), "当前没有投屏画面");
        assert!(!matches!(err, PresentError::Internal(_)));
    }

    #[test]
    fn screenshot_write_fail_is_internal() {
        let dir = std::env::temp_dir();
        let path = dir.to_str().expect("temp utf8");
        let err = screenshot_from_pixels(path, Some((1, 1, vec![0, 0, 0, 255]))).unwrap_err();
        assert!(matches!(err, PresentError::Internal(_)));
        assert_ne!(err, PresentError::Empty);
    }

    #[test]
    fn screenshot_host_gone_is_exited_not_empty() {
        let err = screenshot_host_reply(None::<Result<(), PresentError>>).unwrap_err();
        assert_eq!(err, PresentError::Exited);
        assert_ne!(err, PresentError::Empty);
        let empty = screenshot_host_reply(Some(Err::<(), _>(PresentError::Empty))).unwrap_err();
        assert_eq!(empty, PresentError::Empty);
    }

    #[test]
    fn unbind_clears_same_serial_pending() {
        let mut pending = Some(("A".to_string(), 1u64, ()));
        apply_pending_unbind(&mut pending, "A");
        assert!(pending.is_none());
    }

    #[test]
    fn unbind_keeps_other_serial_pending() {
        let mut pending = Some(("A".to_string(), 1u64, ()));
        apply_pending_unbind(&mut pending, "B");
        assert_eq!(pending.as_ref().map(|(s, ..)| s.as_str()), Some("A"));
    }

    #[test]
    fn shutdown_clears_pending() {
        let mut pending = Some(("A".to_string(), 1u64, ()));
        apply_pending_shutdown(&mut pending);
        assert!(pending.is_none());
        let mut empty: Option<(String, u64, ())> = None;
        apply_pending_shutdown(&mut empty);
        assert!(empty.is_none());
    }

    #[test]
    fn probe_id_is_stable() {
        let caps = probe();
        #[cfg(windows)]
        assert_eq!(caps.id, "media-foundation");
        #[cfg(target_os = "macos")]
        assert_eq!(caps.id, "videotoolbox");
        #[cfg(target_os = "linux")]
        assert_eq!(caps.id, "vaapi");
        assert!(!caps.id.is_empty());
    }
}
