//! 呈现线程：只调度 `Cmd` → Stage / Gpu。解码座在 [`super::decode::DecodeSeat`]。

#![cfg(windows)]

use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::time::Instant;

use tokio::sync::mpsc as tokio_mpsc;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::InvalidateRect;
use windows::Win32::UI::WindowsAndMessaging::DestroyWindow;
use yohu_mirror::MirrorService;
use yohu_protocol::{layout_is_presentable, AppEvent};

use super::d3d::D3dDevice;
use super::follow::GeomHost;
use super::gpu::Gpu;
use super::host::{self, Host};
use super::slot::PictureBank;
use super::window;
use crate::limits::{PRESENT_BOOTSTRAP_PX, PRESENT_IDLE, PRESENT_SPIN_DELTA, PRESENT_SPIN_STEP};
use crate::mirror_present::backend::{poll_ready, poll_timeout, Cmd, SurfacePoll};

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
    let name = crate::mirror_present::present_thread_name(&serial);
    crate::mirror_present::spawn_present_thread(name, move || {
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
            crate::mirror_present::present_beat::log_present_exit(&e);
        }
    });
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
        host::follow_host_size(hwnd);
        let mut live = None;
        let mut dirty = false;
        match poll_timeout(rx.recv_timeout(PRESENT_IDLE)) {
            SurfacePoll::Stop => break,
            SurfacePoll::Ready(cmd) => {
                live = dispatch(hwnd, cmd, &pictures);
                dirty = true;
            }
            SurfacePoll::Idle => {}
        }
        match drain_cmds(&rx, hwnd, &pictures, &mut live) {
            None => break,
            Some(more) => dirty |= more,
        }
        // 一拍 Cmd 排空后再占用：切回 bank 命中是 None→Dest Follow，不是 Fill 后再 FillToDest。
        if dirty {
            host::flush_occupancy(hwnd);
        }
        if let Some(frame) = live {
            host::present_picture(
                hwnd,
                frame.content_w,
                frame.content_h,
                frame.picture_w,
                frame.picture_h,
                frame.picture,
            );
        }
        host::follow_host_size(hwnd);
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

fn same_present_identity(serial_a: &str, generation_a: u64, serial_b: &str, generation_b: u64) -> bool {
    serial_a == serial_b && generation_a == generation_b
}

fn dispatch(hwnd: HWND, cmd: Cmd, pictures: &PictureBank) -> Option<super::slot::ReadyFrame> {
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
            None
        }
        Cmd::BindPipe {
            serial,
            generation,
            pipe: _,
        } => {
            let live = pictures.latest().and_then(|(_, frame)| {
                if same_present_identity(&frame.serial, frame.generation, &serial, generation) {
                    Some(frame)
                } else {
                    None
                }
            });
            host::with_host(hwnd, |h| {
                h.bind(hwnd, serial, generation);
                if let Some(frame) = live.as_ref() {
                    h.resume_live_frame(frame.content_w, frame.content_h);
                }
            });
            live
        }
        Cmd::UnbindPipe { serial } => {
            let _ = host::with_host(hwnd, |h| h.unbind(&serial));
            None
        }
        Cmd::AdoptContent { width, height } => {
            host::with_host(hwnd, |h| h.stage.adopt_encoded_size(width, height));
            None
        }
        Cmd::Screenshot { path, reply } => {
            let result = crate::mirror_present::screenshot_host_reply(Some(host::screenshot_hwnd(
                hwnd, &path,
            )));
            let _ = reply.send(result);
            None
        }
        Cmd::Pointer { kind, x, y } => {
            host::apply_pointer(hwnd, kind, x, y);
            None
        }
        Cmd::Shutdown => None,
    }
}

fn drain_cmds(
    rx: &Receiver<Cmd>,
    hwnd: HWND,
    pictures: &PictureBank,
    live: &mut Option<super::slot::ReadyFrame>,
) -> Option<bool> {
    let mut more = false;
    loop {
        match poll_ready(rx.try_recv()) {
            SurfacePoll::Stop => return None,
            SurfacePoll::Idle => return Some(more),
            SurfacePoll::Ready(cmd) => {
                more = true;
                if let Some(frame) = dispatch(hwnd, cmd, pictures) {
                    *live = Some(frame);
                }
            }
        }
    }
}

fn tick_picture(hwnd: HWND, pictures: &PictureBank, last_seq: &mut u64) {
    let sized = host::with_host(hwnd, |h| {
        let (w, hgt) = h.stage.host_size();
        layout_is_presentable(w, hgt)
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
        same_present_identity(&h.stage.serial, h.stage.generation, &frame.serial, frame.generation)
    })
    .unwrap_or(false);
    if !matched {
        return;
    }
    host::with_host(hwnd, |h| {
        h.stage.adopt_encoded_size(frame.content_w, frame.content_h)
    });
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
