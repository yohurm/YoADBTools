//! 壳内投屏呈现：编译期系统硬解（ADR-v6-024/026/027/028/030/032）。
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
use windows::{D3dDevice, DecodeSeat, GeomHost, PictureBank};

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
    #[cfg(windows)]
    d3d: Mutex<Option<Arc<D3dDevice>>>,
    #[cfg(windows)]
    pictures: Arc<PictureBank>,
}

struct Inner {
    owner: isize,
    /// 主窗至多一块舞台表面（本期否决多设备同时投屏）。
    surface: Option<Sender<Cmd>>,
    /// 当前舞台 serial；与 `screenshot` 参数对账。
    stage_serial: Option<String>,
    /// 仅工作台在 `screen-mirror` 为当前模块时为 true。淡出中的 View 报 layout 也不得建窗。
    active: bool,
    /// 解码座身份。跟 start/stop，不跟 HWND。
    live_bind: Option<(String, u64, Arc<FramePipe>)>,
    /// 舞台可见时最后一次 avail。`setActive(true)` 用它建窗。
    last_layout: Option<MirrorLayout>,
    /// 当前会话的 session 内容尺寸。Live 即可记下，不必等首帧。
    last_content: Option<(String, u32, u32)>,
    #[cfg(windows)]
    decode: Option<DecodeSeat>,
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
                live_bind: None,
                last_layout: None,
                last_content: None,
                #[cfg(windows)]
                decode: None,
            }),
            #[cfg(windows)]
            geom,
            #[cfg(windows)]
            d3d: Mutex::new(None),
            #[cfg(windows)]
            pictures: Arc::new(PictureBank::new()),
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

    /// 入座解码座。未 active 只持座；建窗只走 `setActive(true)` 之后的 `layout`。
    pub fn attach(&self, serial: &str, generation: u64, pipe: Arc<FramePipe>) {
        #[cfg(windows)]
        let d3d = self.ensure_d3d();
        let (tx, last) = {
            let mut inner = self.inner.lock().expect("present lock poisoned");
            #[cfg(windows)]
            let same = inner
                .live_bind
                .as_ref()
                .is_some_and(|(s, g, _)| s == serial && *g == generation);
            inner.live_bind = Some((serial.to_string(), generation, pipe.clone()));
            #[cfg(windows)]
            if !same {
                inner.decode = None;
                if let Some(d3d) = d3d {
                    inner.decode = Some(DecodeSeat::start(
                        d3d,
                        pipe.clone(),
                        Arc::clone(&self.pictures),
                        serial.to_string(),
                        generation,
                    ));
                }
            }
            (inner.surface.clone(), inner.last_content.clone())
        };
        if let Some(tx) = tx {
            send_bind(&tx, serial, generation, pipe);
            send_last_content(&tx, &last, serial);
        }
    }

    /// 停解码座、舞台改画 chrome。表面仍在。同 serial 的 live_bind 丢掉；异 serial 保留。
    pub fn unbind(&self, serial: &str) {
        let mut inner = self.inner.lock().expect("present lock poisoned");
        #[cfg(windows)]
        let drop_seat = inner
            .live_bind
            .as_ref()
            .is_some_and(|(s, ..)| s == serial);
        apply_pending_unbind(&mut inner.live_bind, serial);
        if inner
            .last_content
            .as_ref()
            .is_some_and(|(s, ..)| s == serial)
        {
            inner.last_content = None;
        }
        #[cfg(windows)]
        if drop_seat {
            inner.decode = None;
            self.pictures.clear();
        }
        if let Some(tx) = inner.surface.as_ref() {
            let _ = tx.send(Cmd::UnbindPipe {
                serial: serial.to_string(),
            });
        }
    }

    /// 工作台拥有舞台开关。未激活时一切 `mirror.layout`（含 `visible=true`）丢弃。
    /// 激活时用上次 avail 建窗；解码座继续跑。
    pub fn set_active(&self, active: bool) {
        let replay = {
            let mut inner = self.inner.lock().expect("present lock poisoned");
            inner.active = active;
            if active {
                inner.last_layout.clone()
            } else {
                None
            }
        };
        if active {
            tracing::info!("投屏舞台激活");
            if let Some(layout) = replay {
                tracing::info!(
                    serial = %layout.serial,
                    w = layout.width,
                    h = layout.height,
                    "投屏舞台激活，沿用上次 avail"
                );
                self.layout(layout);
            }
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
        if layout_replayable(&layout) {
            let mut inner = self.inner.lock().expect("present lock poisoned");
            inner.last_layout = Some(layout.clone());
        }
        if !layout_replayable(&layout) {
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
        let created = match self.ensure_surface(&layout.serial) {
            SurfaceEnsure::Failed => return,
            SurfaceEnsure::Created => true,
            SurfaceEnsure::Ready => false,
        };
        let tx = {
            let mut inner = self.inner.lock().expect("present lock poisoned");
            inner.stage_serial = Some(layout.serial.clone());
            inner.surface.clone()
        };
        if let Some(tx) = tx {
            let _ = tx.send(Cmd::Layout(layout));
        }
        // 先 Layout：Stage 可呈现后再 Bind，resume 才能立刻 Present。
        if created {
            self.flush_live_bind();
        }
    }

    /// avail 上报的指针，主窗客户区物理坐标。HWND 不参与命中。
    pub fn pointer(&self, req: yohu_protocol::MirrorPointer) {
        let tx = {
            let inner = self.inner.lock().expect("present lock poisoned");
            if !inner.active {
                return;
            }
            if inner.stage_serial.as_deref() != Some(req.serial.as_str()) {
                return;
            }
            inner.surface.clone()
        };
        if let Some(tx) = tx {
            let _ = tx.send(Cmd::Pointer {
                kind: req.kind,
                x: req.x,
                y: req.y,
            });
        }
    }

    /// session 内容宽高写入 Stage。Loading 即可把占用卡片收到设备比例。
    pub fn adopt_content(&self, serial: &str, width: u32, height: u32) {
        if width == 0 || height == 0 {
            return;
        }
        let tx = {
            let mut inner = self.inner.lock().expect("present lock poisoned");
            let live = inner.live_bind.as_ref().is_some_and(|(s, ..)| s == serial);
            let stage = inner.stage_serial.as_deref() == Some(serial);
            if inner.live_bind.is_some() && !live && !stage {
                return;
            }
            inner.last_content = Some((serial.to_string(), width, height));
            inner.surface.clone()
        };
        if let Some(tx) = tx {
            let _ = tx.send(Cmd::AdoptContent { width, height });
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
    /// 解码座与上次 avail 留下。
    pub fn shutdown(&self) {
        let tx = {
            let mut inner = self.inner.lock().expect("present lock poisoned");
            inner.stage_serial = None;
            inner.surface.take()
        };
        if let Some(tx) = tx {
            let _ = tx.send(Cmd::Shutdown);
        }
    }

    fn ensure_surface(&self, serial: &str) -> SurfaceEnsure {
        {
            let inner = self.inner.lock().expect("present lock poisoned");
            if inner.surface.is_some() {
                return SurfaceEnsure::Ready;
            }
            if inner.owner == 0 {
                tracing::error!("投屏表面尚未绑定主窗口");
                return SurfaceEnsure::Failed;
            }
        }
        let owner = self.inner.lock().expect("present lock poisoned").owner;
        #[cfg(windows)]
        let Some(d3d) = self.ensure_d3d() else {
            return SurfaceEnsure::Failed;
        };
        let tx = spawn_backend_surface(
            serial.to_string(),
            owner,
            Arc::clone(&self.mirror),
            self.event_tx.clone(),
            #[cfg(windows)]
            Arc::clone(&self.geom),
            #[cfg(windows)]
            d3d,
            #[cfg(windows)]
            Arc::clone(&self.pictures),
        );
        self.inner.lock().expect("present lock poisoned").surface = Some(tx);
        SurfaceEnsure::Created
    }

    fn flush_live_bind(&self) {
        let bind = {
            let inner = self.inner.lock().expect("present lock poisoned");
            match (inner.surface.clone(), inner.live_bind.clone(), inner.last_content.clone()) {
                (Some(tx), Some((serial, generation, pipe)), last) => {
                    Some((tx, serial, generation, pipe, last))
                }
                _ => None,
            }
        };
        if let Some((tx, serial, generation, pipe, last)) = bind {
            tracing::info!(serial = %serial, generation, "投屏表面重建，舞台绑定解码座");
            send_bind(&tx, &serial, generation, pipe);
            send_last_content(&tx, &last, &serial);
        }
    }

    #[cfg(windows)]
    fn ensure_d3d(&self) -> Option<Arc<D3dDevice>> {
        let mut slot = self.d3d.lock().expect("present d3d lock poisoned");
        if let Some(d3d) = slot.as_ref() {
            return Some(Arc::clone(d3d));
        }
        let created = spawn_d3d()?;
        *slot = Some(Arc::clone(&created));
        Some(created)
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

enum SurfaceEnsure {
    Ready,
    Created,
    Failed,
}

fn layout_replayable(layout: &MirrorLayout) -> bool {
    layout.visible
        && layout.width >= MIRROR_MIN_LAYOUT_PX
        && layout.height >= MIRROR_MIN_LAYOUT_PX
}

fn send_bind(tx: &Sender<Cmd>, serial: &str, generation: u64, pipe: Arc<FramePipe>) {
    let _ = tx.send(Cmd::BindPipe {
        serial: serial.to_string(),
        generation,
        pipe,
    });
}

fn send_last_content(tx: &Sender<Cmd>, last: &Option<(String, u32, u32)>, serial: &str) {
    let Some((s, width, height)) = last else {
        return;
    };
    if s == serial && *width > 0 && *height > 0 {
        let _ = tx.send(Cmd::AdoptContent {
            width: *width,
            height: *height,
        });
    }
}

#[cfg(windows)]
fn spawn_d3d() -> Option<Arc<D3dDevice>> {
    match D3dDevice::create() {
        Ok(d3d) => Some(d3d),
        Err(e) => {
            tracing::error!(error = %e, "投屏 D3D11 设备建立失败");
            None
        }
    }
}

/// `unbind(serial)`：同 serial 丢掉 live_bind；异 serial 保留。只看 serial。
fn apply_pending_unbind<P, G>(pending: &mut Option<(String, P, G)>, serial: &str) {
    if pending.as_ref().is_some_and(|(s, ..)| s == serial) {
        pending.take();
    }
}

fn spawn_backend_surface(
    serial: String,
    owner: isize,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    #[cfg(windows)] geom: Arc<GeomHost>,
    #[cfg(windows)] d3d: Arc<D3dDevice>,
    #[cfg(windows)] pictures: Arc<PictureBank>,
) -> Sender<Cmd> {
    #[cfg(windows)]
    {
        windows::spawn_surface(serial, owner, mirror, event_tx, geom, d3d, pictures)
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
        apply_pending_unbind, assert_screenshot_serial, layout_replayable, probe,
        screenshot_from_pixels, screenshot_host_reply, PresentError,
    };
    use yohu_protocol::MirrorLayout;

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
    fn unbind_does_not_clear_other_and_surface_drop_keeps_bind() {
        let mut live = Some(("A".to_string(), 1u64, ()));
        apply_pending_unbind(&mut live, "B");
        assert_eq!(live.as_ref().map(|(s, ..)| s.as_str()), Some("A"));
    }

    #[test]
    fn hidden_layout_is_not_replayable() {
        let mut layout = MirrorLayout {
            serial: "S1".into(),
            x: 10,
            y: 20,
            width: 800,
            height: 600,
            visible: true,
            dpr: 1.5,
            fullscreen: false,
            paused: false,
            control: true,
            has_device: true,
            failed: false,
            error: String::new(),
            dark: false,
        };
        assert!(layout_replayable(&layout));
        layout.visible = false;
        assert!(!layout_replayable(&layout));
        layout.visible = true;
        layout.width = 1;
        layout.height = 1;
        assert!(!layout_replayable(&layout));
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
