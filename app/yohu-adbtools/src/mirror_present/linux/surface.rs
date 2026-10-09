//! 呈现线程：Cmd → 解码 → 主线程翻页。GTK 只在主线程碰。

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::{FramePipe, MirrorService};
use yohu_protocol::AppEvent;

use super::super::annexb::{begin_feed, note_decode_beat, select_live_frames, DecodeSeatKind};
use super::super::backend::{
    bind_after_pipe, poll_ready, poll_timeout, Cmd, PresentBind, SurfacePoll,
};
use super::super::scale::Letterbox;
use super::color::scale_bgra;
use super::host::{Host, LayoutSnap};
use super::openh264::OpenH264Decoder;
use super::vaapi::{VaBlit, VaDecoder};
use super::widget::{self, StagePaint};
use crate::limits::{PRESENT_BEAT, PRESENT_IDLE};
use crate::mirror_present::PresentError;

pub fn spawn_surface(
    serial: String,
    owner: isize,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    bind: Arc<Mutex<PresentBind>>,
    openh264_on: Arc<AtomicBool>,
    openh264_dir: PathBuf,
) -> Sender<Cmd> {
    let (tx, rx) = mpsc::channel::<Cmd>();
    let name = crate::mirror_present::present_thread_name(&serial);
    let boot = Boot {
        serial,
        owner,
        mirror,
        event_tx,
        bind,
        openh264_on,
        openh264_dir,
    };
    crate::mirror_present::spawn_present_thread(name, move || {
        if let Err(e) = run_loop(boot, rx) {
            crate::mirror_present::present_beat::log_present_exit(&e);
        }
    });
    tx
}

struct Boot {
    serial: String,
    owner: isize,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    bind: Arc<Mutex<PresentBind>>,
    openh264_on: Arc<AtomicBool>,
    openh264_dir: PathBuf,
}

struct Seat {
    va_tried: bool,
    va: Option<VaDecoder>,
    soft: Option<OpenH264Decoder>,
    failed: Option<PresentError>,
    hevc_logged: bool,
    last_config: Option<Vec<u8>>,
    fed: u32,
    decoded: u32,
}

struct Live {
    host: Arc<Mutex<Host>>,
    seat: Seat,
    pipe: Option<Arc<FramePipe>>,
    xid: Arc<AtomicU64>,
    openh264_on: Arc<AtomicBool>,
    openh264_dir: PathBuf,
    shared: Arc<widget::Shared>,
}

fn run_loop(boot: Boot, rx: Receiver<Cmd>) -> Result<(), String> {
    let xid = Arc::new(AtomicU64::new(0));
    let shared = widget::shared(Arc::clone(&xid));
    widget::boot(boot.owner, Arc::clone(&shared));
    let mut live = Live {
        host: Arc::new(Mutex::new(Host::new(
            boot.serial,
            boot.mirror,
            boot.event_tx,
            boot.bind,
        ))),
        seat: Seat {
            va_tried: false,
            va: None,
            soft: None,
            failed: None,
            hevc_logged: false,
            last_config: None,
            fed: 0,
            decoded: 0,
        },
        pipe: None,
        xid,
        openh264_on: boot.openh264_on,
        openh264_dir: boot.openh264_dir,
        shared,
    };
    let mut beat = Instant::now();
    loop {
        match poll_timeout(rx.recv_timeout(PRESENT_IDLE)) {
            SurfacePoll::Stop => break,
            SurfacePoll::Ready(cmd) => live.dispatch(cmd),
            SurfacePoll::Idle => {}
        }
        if !live.drain(&rx) {
            break;
        }
        if live.pipe.is_some() {
            live.ensure_decoder();
            live.tick();
        }
        if beat.elapsed() >= PRESENT_BEAT {
            note_decode_beat(
                &mut live.seat.fed,
                &mut live.seat.decoded,
                DecodeSeatKind::Linux,
            );
            beat = Instant::now();
        }
    }
    if let Ok(mut host) = live.host.lock() {
        host.end_press();
    }
    widget::post(&live.shared, hidden_paint().job());
    Ok(())
}

impl Live {
    fn dispatch(&mut self, cmd: Cmd) {
        match cmd {
            Cmd::Layout(layout) => {
                crate::mirror_present::lock_present(&self.host).apply_layout(&layout);
                self.sync(None);
            }
            Cmd::BindPipe {
                serial,
                generation,
                pipe,
            } => {
                crate::mirror_present::lock_present(&self.host).bind(serial, generation);
                self.pipe = Some(pipe);
                self.seat.failed = None;
                self.ensure_decoder();
                self.sync(None);
            }
            Cmd::UnbindPipe { serial } => {
                if crate::mirror_present::lock_present(&self.host).unbind(&serial) {
                    self.pipe = None;
                    self.seat.va = None;
                    self.seat.soft = None;
                    self.seat.va_tried = false;
                    self.seat.failed = None;
                    self.seat.last_config = None;
                }
                self.sync(None);
            }
            Cmd::AdoptContent { width, height } => {
                crate::mirror_present::lock_present(&self.host).adopt_content(width, height);
                self.sync(None);
            }
            Cmd::Screenshot { path, reply } => {
                let result = crate::mirror_present::lock_present(&self.host).screenshot(&path);
                let _ = reply.send(result);
            }
            Cmd::Pointer { kind, x, y } => {
                crate::mirror_present::lock_present(&self.host).handle_wire_pointer(kind, x, y);
            }
            Cmd::Shutdown => {}
        }
    }

    fn drain(&mut self, rx: &Receiver<Cmd>) -> bool {
        loop {
            match poll_ready(rx.try_recv()) {
                SurfacePoll::Stop => return false,
                SurfacePoll::Idle => return true,
                SurfacePoll::Ready(cmd) => self.dispatch(cmd),
            }
        }
    }

    fn ensure_decoder(&mut self) {
        let enabled = self.openh264_on.load(Ordering::SeqCst);
        if self.seat.soft.is_some() && !enabled && self.seat.va.is_none() {
            self.seat.soft = None;
            self.fail(PresentError::OpenH264Disabled);
            return;
        }
        if self.seat.va.is_some() || self.seat.soft.is_some() {
            if self.seat.failed.take().is_some() {
                crate::mirror_present::lock_present(&self.host).publish(bind_after_pipe(true));
            }
            return;
        }
        if let Some(err) = self.seat.failed {
            let retry = enabled
                && (err == PresentError::OpenH264Disabled
                    || (err == PresentError::OpenH264Missing
                        && super::openh264::locate(&self.openh264_dir).is_some()));
            if !retry {
                return;
            }
            self.seat.failed = None;
        }
        if !self.seat.va_tried {
            self.seat.va_tried = true;
            if let Some(dec) = VaDecoder::open(Arc::clone(&self.xid)) {
                tracing::info!("Linux 投屏 Convert 使用 libva H.264 VLD");
                self.seat.va = Some(dec);
                crate::mirror_present::lock_present(&self.host).publish(bind_after_pipe(true));
                return;
            }
            tracing::info!("没有 H.264 VLD，改试 OpenH264");
        }
        if !enabled {
            self.fail(PresentError::OpenH264Disabled);
            return;
        }
        match OpenH264Decoder::open(&self.openh264_dir) {
            Ok(dec) => {
                tracing::info!("Linux 投屏 Convert 使用 OpenH264");
                self.seat.soft = Some(dec);
                self.seat.failed = None;
                crate::mirror_present::lock_present(&self.host).publish(bind_after_pipe(true));
            }
            Err(error) => {
                tracing::warn!(error = %error, "OpenH264 没有打开");
                self.fail(PresentError::OpenH264Missing);
            }
        }
    }

    fn fail(&mut self, err: PresentError) {
        self.seat.failed = Some(err);
        crate::mirror_present::lock_present(&self.host).publish(PresentBind::Failed(err));
    }

    fn tick(&mut self) {
        let Some(pipe) = self.pipe.clone() else {
            return;
        };
        let frames = pipe.drain_ready();
        if frames.is_empty() {
            return;
        }
        let frames = select_live_frames(&mut self.seat.last_config, frames);
        for frame in frames {
            if frame.is_hevc() {
                if !self.seat.hevc_logged {
                    self.seat.hevc_logged = true;
                    tracing::warn!("Linux 这一版只解 H.264，丢弃 HEVC 访问单元");
                }
                continue;
            }
            let au = begin_feed(
                &mut self.seat.fed,
                self.seat.last_config.as_deref(),
                &frame.payload,
                frame.keyframe,
            );
            let Some((yuv, blit)) = self.decode_au(&au) else {
                continue;
            };
            self.seat.decoded = self.seat.decoded.saturating_add(1);
            crate::mirror_present::lock_present(&self.host).take_picture(yuv);
            self.sync(blit);
        }
    }

    fn decode_au(&mut self, au: &[u8]) -> Option<(super::color::OwnedYuv, Option<VaBlit>)> {
        if let Some(va) = self.seat.va.as_mut() {
            match va.feed(au) {
                Ok(Some((yuv, blit))) => return Some((yuv, blit)),
                Ok(None) => return None,
                Err(error) => {
                    tracing::warn!(error = %error, "libva 这一帧失败，改用 OpenH264");
                    self.seat.va = None;
                }
            }
        }
        if self.seat.soft.is_none() {
            match OpenH264Decoder::open(&self.openh264_dir) {
                Ok(dec) => {
                    tracing::info!("Linux 投屏 Convert 改用 OpenH264");
                    self.seat.soft = Some(dec);
                }
                Err(error) => {
                    tracing::warn!(error = %error, "OpenH264 没有打开");
                    return None;
                }
            }
        }
        let soft = self.seat.soft.as_mut()?;
        match soft.feed(au) {
            Ok(Some(yuv)) => Some((yuv, None)),
            Ok(None) => None,
            Err(error) => {
                tracing::warn!(error = %error, "OpenH264 这一帧失败");
                None
            }
        }
    }

    fn sync(&mut self, blit: Option<VaBlit>) {
        let host = crate::mirror_present::lock_present(&self.host);
        let snap = host.layout_snap();
        let show = self.seat.failed.is_none() && snap.avail_w > 0 && snap.avail_h > 0;
        let paint = stage_paint(&snap, show);
        let yuv = if snap.video {
            host.paint_source().cloned()
        } else {
            None
        };
        let dest = snap.dest;
        drop(host);
        if let Some(yuv) = yuv {
            let bgra = scale_bgra(&yuv, dest);
            let width = dest.width.max(1) as i32;
            let height = dest.height.max(1) as i32;
            widget::post(
                &self.shared,
                paint.with_video(bgra, width, height, dest, blit),
            );
            return;
        }
        drop(blit);
        widget::post(&self.shared, paint.job());
    }
}

fn stage_paint(snap: &LayoutSnap, show: bool) -> StagePaint {
    StagePaint {
        show,
        avail_x: snap.avail_x,
        avail_y: snap.avail_y,
        avail_w: snap.avail_w as i32,
        avail_h: snap.avail_h as i32,
        card: snap.dest,
        radius: snap.radius,
        stroke: snap.stroke,
        border: snap.border,
        canvas: snap.canvas,
        page: snap.page,
        title_argb: snap.title_argb,
        body_argb: snap.body_argb,
        icon_argb: snap.icon_argb,
        well_argb: snap.well_argb,
        icon_px: snap.icon_px,
        title_px: snap.title_px,
        body_px: snap.body_px,
        title: snap.title.to_string(),
        body: snap.description.clone(),
        chrome: snap.chrome,
        loading: snap.loading,
        motion: snap.motion.clone(),
    }
}

fn hidden_paint() -> StagePaint {
    StagePaint {
        show: false,
        avail_x: 0,
        avail_y: 0,
        avail_w: 0,
        avail_h: 0,
        card: Letterbox {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            nearest: false,
            crop_w: 0,
            crop_h: 0,
        },
        radius: 0.0,
        stroke: 0.0,
        border: 0,
        canvas: 0,
        page: 0,
        title_argb: 0,
        body_argb: 0,
        icon_argb: 0,
        well_argb: 0,
        icon_px: 0,
        title_px: 0,
        body_px: 0,
        title: String::new(),
        body: String::new(),
        chrome: false,
        loading: false,
        motion: None,
    }
}
