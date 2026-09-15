//! 呈现线程：只调度 `Cmd` → Stage / Gpu。解码座在 [`super::decode::DecodeSeat`]。

#![cfg(windows)]

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::Arc;
use std::time::Instant;

use tokio::sync::mpsc as tokio_mpsc;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::InvalidateRect;
use windows::Win32::UI::WindowsAndMessaging::DestroyWindow;
use yohu_mirror::MirrorService;
use yohu_protocol::{AppEvent, MIRROR_MIN_LAYOUT_PX};

use super::d3d::D3dDevice;
use super::follow::GeomHost;
use super::gpu::Gpu;
use super::host::{self, Host};
use super::slot::PictureBank;
use super::window;
use crate::limits::{
    PRESENT_BOOTSTRAP_PX, PRESENT_IDLE, PRESENT_SPIN_DELTA, PRESENT_SPIN_STEP,
};
use crate::mirror_present::backend::Cmd;

pub fn spawn_surface(
    serial: String,
    owner: isize,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    geom: Arc<GeomHost>,
    d3d: Arc<D3dDevice>,
    pictures: Arc<PictureBank>,
) -> Sender<Cmd> {
    let (tx, rx) = mpsc::channel::<Cmd>();
    std::thread::Builder::new()
        .name(format!("mirror-present-{serial}"))
        .spawn(move || {
            let ctx = PresentCtx {
                serial,
                owner,
                mirror,
                event_tx,
                geom,
                d3d,
                pictures,
            };
            if let Err(e) = run_loop(ctx, rx) {
                tracing::error!("投屏呈现退出: {e}");
            }
        })
        .expect("spawn present thread");
    tx
}

struct PresentCtx {
    serial: String,
    owner: isize,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    geom: Arc<GeomHost>,
    d3d: Arc<D3dDevice>,
    pictures: Arc<PictureBank>,
}

fn run_loop(ctx: PresentCtx, rx: Receiver<Cmd>) -> Result<(), String> {
    let PresentCtx {
        serial,
        owner,
        mirror,
        event_tx,
        geom,
        d3d,
        pictures,
    } = ctx;
    super::mf::ensure_startup()?;
    window::register_class()?;
    let hwnd = window::create_child(HWND(owner as *mut _))?;
    geom.register(&serial, hwnd.0 as isize);
    let gpu = Gpu::new(&d3d, hwnd, PRESENT_BOOTSTRAP_PX, PRESENT_BOOTSTRAP_PX)
        .map_err(|e| e.to_string())?;
    host::install(
        hwnd,
        Host::new(serial, gpu, mirror, event_tx, Arc::clone(&geom)),
    );

    let mut pic_seq = 0_u64;
    let mut spin_at = Instant::now();
    let mut spin = 0.0_f32;
    loop {
        window::pump_messages(hwnd);
        host::with_host(hwnd, |h| h.sync_host_size(hwnd));
        match rx.recv_timeout(PRESENT_IDLE) {
            Ok(Cmd::Shutdown) | Err(RecvTimeoutError::Disconnected) => break,
            Ok(cmd) => dispatch(hwnd, cmd, &pictures),
            Err(RecvTimeoutError::Timeout) => {}
        }
        if !drain_cmds(&rx, hwnd, &pictures) {
            break;
        }
        host::with_host(hwnd, |h| h.sync_host_size(hwnd));
        tick_picture(hwnd, &pictures, &mut pic_seq);
        if host::loading(hwnd) && spin_at.elapsed() >= PRESENT_SPIN_STEP {
            spin_at = Instant::now();
            spin = (spin + PRESENT_SPIN_DELTA) % (std::f32::consts::PI * 2.0);
        }
        host::present_chrome(hwnd, spin);
    }
    let serial = host::uninstall(hwnd).unwrap_or_default();
    geom.unregister(&serial);
    unsafe {
        let _ = DestroyWindow(hwnd);
        let _ = InvalidateRect(Some(HWND(owner as *mut _)), None, true);
    }
    Ok(())
}

fn dispatch(hwnd: HWND, cmd: Cmd, pictures: &PictureBank) {
    match cmd {
        Cmd::Layout(layout) => {
            let applied = host::with_host(hwnd, |h| h.apply_layout(hwnd, &layout));
            if applied.is_none() {
                tracing::warn!(
                    w = layout.width,
                    h = layout.height,
                    visible = layout.visible,
                    "投屏 layout 丢弃：HWND 尚未就绪"
                );
            }
        }
        Cmd::BindPipe {
            serial,
            generation,
            pipe: _,
        } => {
            host::with_host(hwnd, |h| {
                h.bind(hwnd, serial, generation);
                if let Some((_, frame)) = pictures.latest() {
                    h.adopt_encoded_size(frame.content_w, frame.content_h);
                }
            });
        }
        Cmd::UnbindPipe { serial } => {
            let _ = host::with_host(hwnd, |h| h.unbind(&serial));
        }
        Cmd::AdoptContent { width, height } => {
            host::with_host(hwnd, |h| h.adopt_encoded_size(width, height));
        }
        Cmd::Screenshot { path, reply } => {
            let result = crate::mirror_present::screenshot_host_reply(host::with_host(hwnd, |h| {
                h.screenshot(&path)
            }));
            let _ = reply.send(result);
        }
        Cmd::Shutdown => {}
    }
}

fn drain_cmds(rx: &Receiver<Cmd>, hwnd: HWND, pictures: &PictureBank) -> bool {
    loop {
        match rx.try_recv() {
            Ok(Cmd::Shutdown) | Err(TryRecvError::Disconnected) => return false,
            Err(TryRecvError::Empty) => return true,
            Ok(cmd) => dispatch(hwnd, cmd, pictures),
        }
    }
}

fn tick_picture(hwnd: HWND, pictures: &PictureBank, last_seq: &mut u64) {
    let sized = host::with_host(hwnd, |h| {
        let (w, hgt) = h.stage.host_size();
        w >= MIRROR_MIN_LAYOUT_PX && hgt >= MIRROR_MIN_LAYOUT_PX
    })
    .unwrap_or(false);
    if !sized {
        return;
    }
    let Some((seq, frame)) = pictures.latest() else {
        return;
    };
    if seq == *last_seq {
        return;
    }
    let matched = host::with_host(hwnd, |h| {
        h.stage.serial == frame.serial && h.stage.generation == frame.generation
    })
    .unwrap_or(false);
    if !matched {
        return;
    }
    host::with_host(hwnd, |h| h.adopt_encoded_size(frame.content_w, frame.content_h));
    if host::present_picture(
        hwnd,
        frame.content_w,
        frame.content_h,
        frame.picture_w,
        frame.picture_h,
        frame.picture,
    ) {
        *last_seq = seq;
    }
}
