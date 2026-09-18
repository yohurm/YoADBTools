//! HWND 宿主：交换链 + [`Stage`] + 输入。不持有解码座。
//!
//! Host 锁只护 Stage 与 Gpu 所有权。`wndproc` 不进这把锁。
//! `SetWindowPos` / `ShowWindow` / `ResizeBuffers` / DComp Commit / DXGI Present
//! 在锁外跑：它们会泵消息，`Mutex` 不能重入。

#![cfg(windows)]

use std::sync::{Arc, Mutex};
use std::time::Instant;

use tokio::sync::mpsc as tokio_mpsc;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClientRect, GetWindowLongPtrW, SetWindowLongPtrW, ShowWindow, GWLP_USERDATA,
    SW_SHOWNOACTIVATE,
};
use yohu_mirror::MirrorService;
use yohu_protocol::{
    AppEvent, MirrorControlMessage, MirrorLayout, MirrorPointerKind, MirrorStageMode,
    MIRROR_MIN_LAYOUT_PX,
};

use super::follow::GeomHost;
use super::gpu::Gpu;
use super::mf::DecodedPicture;
use crate::mirror_present::pointer::{PointerGesture, PointerKind, TouchOut};
use crate::mirror_present::scale::map_client_to_video;
use crate::mirror_present::stage::{OccupancyMotion, Stage};
use crate::mirror_present::{screenshot_from_pixels, PresentError};

struct ClipJob {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    radius: u32,
    motion: OccupancyMotion,
}

struct GpuJob {
    gpu: Gpu,
    resize: Option<(u32, u32)>,
    clip: Option<ClipJob>,
    replay: Option<(crate::mirror_present::scale::Letterbox, u32)>,
}

struct Slot {
    host: Mutex<Host>,
}

pub struct Host {
    pub stage: Stage,
    gpu: Option<Gpu>,
    gesture: PointerGesture,
    painted: u32,
    fps_at: Instant,
    skip_logged: Option<(bool, u32, u32)>,
    present_err_logged: bool,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    geom: Arc<GeomHost>,
}

impl Host {
    pub fn new(
        serial: String,
        gpu: Gpu,
        mirror: Arc<MirrorService>,
        event_tx: tokio_mpsc::Sender<AppEvent>,
        geom: Arc<GeomHost>,
    ) -> Self {
        Self {
            stage: Stage::new(serial),
            gpu: Some(gpu),
            gesture: PointerGesture::default(),
            painted: 0,
            fps_at: Instant::now(),
            skip_logged: None,
            present_err_logged: false,
            mirror,
            event_tx,
            geom,
        }
    }

    pub fn apply_layout(&mut self, hwnd: HWND, layout: &MirrorLayout) {
        let prev = self.stage.serial.clone();
        self.stage.apply_layout(layout);
        if self.stage.serial != prev {
            self.geom.unregister(&prev);
            self.geom.register(&self.stage.serial, hwnd.0 as isize);
        }
        tracing::info!(
            serial = %self.stage.serial,
            x = layout.x,
            y = layout.y,
            w = layout.width,
            h = layout.height,
            visible = layout.visible,
            dpr = layout.dpr,
            fullscreen = layout.fullscreen,
            paused = layout.paused,
            bound = self.stage.bound(),
            video_w = self.stage.video_size().0,
            video_h = self.stage.video_size().1,
            "投屏可用区已交给几何宿主"
        );
        if !self.stage.control() {
            self.end_press();
        }
    }

    pub fn bind(&mut self, hwnd: HWND, serial: String, generation: u64) {
        if self.stage.serial != serial {
            self.geom.unregister(&self.stage.serial);
            self.geom.register(&serial, hwnd.0 as isize);
        }
        self.stage.bind(serial, generation);
        self.present_err_logged = false;
        self.painted = 0;
        tracing::info!(
            serial = %self.stage.serial,
            generation,
            "投屏解码管道已绑定"
        );
    }

    /// 表面重建时槽里已有同代画面：直接进 Video，禁止再走 Loading→Fill。
    pub fn resume_live_frame(&mut self, content_w: u32, content_h: u32) {
        self.adopt_encoded_size(content_w, content_h);
        if self.stage.bound() && content_w > 0 && content_h > 0 {
            self.stage.mark_frame();
        }
    }

    pub fn unbind(&mut self, target: &str) -> bool {
        if !target.is_empty() && self.stage.serial != target {
            return false;
        }
        self.end_press();
        let serial = self.stage.serial.clone();
        self.stage.unbind();
        tracing::info!(serial = %serial, "投屏解码管道已解开，舞台改画 chrome");
        true
    }

    pub fn adopt_encoded_size(&mut self, width: u32, height: u32) {
        if self.stage.set_video_size(width, height) {
            tracing::info!(
                serial = %self.stage.serial,
                width,
                height,
                "投屏记下 session 内容尺寸"
            );
        }
    }

    pub fn handle_wire_pointer(&mut self, kind: MirrorPointerKind, x: i32, y: i32) {
        match kind {
            MirrorPointerKind::Leave => self.handle_leave(),
            MirrorPointerKind::Down => self.feed_pointer(PointerKind::Down, x, y),
            MirrorPointerKind::Move => self.feed_pointer(PointerKind::Move, x, y),
            MirrorPointerKind::Up => self.feed_pointer(PointerKind::Up, x, y),
        }
    }

    fn feed_pointer(&mut self, kind: PointerKind, x: i32, y: i32) {
        if !self.stage.control() {
            self.end_press();
            return;
        }
        let (video_w, video_h) = self.stage.video_size();
        let mapped = map_client_to_video(x, y, self.stage.dest(), video_w, video_h);
        if let Some(out) = self.gesture.feed(kind, mapped, video_w, video_h) {
            self.inject_touch(out);
        }
    }

    pub fn handle_leave(&mut self) {
        if let Some(out) = self.gesture.feed(PointerKind::Leave, None, 0, 0) {
            self.inject_touch(out);
        }
    }

    pub fn end_press(&mut self) {
        if let Some(out) = self.gesture.cancel() {
            self.inject_touch(out);
        }
    }

    fn inject_touch(&self, out: TouchOut) {
        let serial = self.stage.serial.clone();
        let mirror = Arc::clone(&self.mirror);
        let message = MirrorControlMessage::Touch {
            action: out.action,
            x: out.x,
            y: out.y,
            width: out.width,
            height: out.height,
        };
        tauri::async_runtime::spawn(async move {
            let _ = mirror.inject(&serial, message).await;
        });
    }

    fn write_geom_visible(&mut self) {
        self.geom
            .set_visible(&self.stage.serial, self.stage.visible());
        let (stroke_px, border) = self.stage.panel_stroke();
        let radius = self.stage.corner_radius();
        if let Some(gpu) = self.gpu.as_mut() {
            gpu.set_panel_chrome(radius, stroke_px, border);
        }
    }

    fn plan_gpu(&mut self, hwnd: HWND, motion: OccupancyMotion) -> Option<GpuJob> {
        let (w, h) = client_px(hwnd)?;
        self.stage.set_host_size(w, h);
        if w < MIRROR_MIN_LAYOUT_PX || h < MIRROR_MIN_LAYOUT_PX {
            return None;
        }
        let gpu = self.gpu.take()?;
        let resize = if gpu.matches_host(w, h) {
            None
        } else {
            Some((w, h))
        };
        let (cx, cy, cw, ch) = self.stage.occupancy();
        let replay = if self.stage.shows_video() {
            Some((self.stage.dest(), self.stage.letterbox_argb()))
        } else {
            None
        };
        Some(GpuJob {
            gpu,
            resize,
            clip: Some(ClipJob {
                x: cx,
                y: cy,
                w: cw,
                h: ch,
                radius: self.stage.corner_radius(),
                motion,
            }),
            replay,
        })
    }

    fn gpu_matches_host(&self) -> bool {
        let (w, h) = self.stage.host_size();
        self.gpu.as_ref().is_some_and(|g| g.matches_host(w, h))
    }

    fn prepare_video(
        &mut self,
        width: u32,
        height: u32,
    ) -> Option<(Gpu, crate::mirror_present::scale::Letterbox, u32)> {
        let _ = self.stage.set_video_size(width, height);
        if !self.stage.presentable() {
            let (lw, lh) = self.stage.host_size();
            let key = (self.stage.visible(), lw, lh);
            if self.skip_logged != Some(key) {
                self.skip_logged = Some(key);
                tracing::warn!(
                    serial = %self.stage.serial,
                    visible = self.stage.visible(),
                    layout_w = lw,
                    layout_h = lh,
                    "投屏 Present 跳过：等待有效 layout"
                );
            }
            return None;
        }
        if !self.stage.allows_video_present() || !self.gpu_matches_host() {
            return None;
        }
        self.skip_logged = None;
        let dest = self.stage.dest();
        let letterbox = self.stage.letterbox_argb();
        let gpu = self.gpu.take()?;
        Some((gpu, dest, letterbox))
    }

    fn commit_video(
        &mut self,
        width: u32,
        height: u32,
        presented: bool,
        error: Option<&windows::core::Error>,
    ) -> bool {
        if !presented {
            if !self.present_err_logged {
                self.present_err_logged = true;
                if let Some(e) = error {
                    tracing::warn!(error = %e, width, height, "投屏 Present 失败");
                }
            }
            return false;
        }
        self.present_err_logged = false;
        self.painted += 1;
        let now = Instant::now();
        if !self.stage.has_frame() {
            self.stage.mark_frame();
            self.fps_at = now;
            self.painted = 0;
            tracing::info!(
                serial = %self.stage.serial,
                generation = self.stage.generation,
                width,
                height,
                "投屏首帧已 Present"
            );
            let _ = self.event_tx.try_send(AppEvent::MirrorPainted {
                serial: self.stage.serial.clone(),
                generation: self.stage.generation,
                painted_fps: 1,
            });
        } else if now.duration_since(self.fps_at) >= crate::limits::PRESENT_BEAT {
            let fps = self.painted;
            self.painted = 0;
            self.fps_at = now;
            let _ = self.event_tx.try_send(AppEvent::MirrorPainted {
                serial: self.stage.serial.clone(),
                generation: self.stage.generation,
                painted_fps: fps,
            });
        }
        self.stage.visible() && self.stage.shows_video()
    }

    fn prepare_chrome(&self) -> Option<crate::mirror_present::stage::ChromeDraw> {
        if !self.gpu_matches_host() {
            return None;
        }
        self.stage.chrome_draw()
    }
}

fn client_px(hwnd: HWND) -> Option<(u32, u32)> {
    let mut rc = RECT::default();
    unsafe {
        GetClientRect(hwnd, &mut rc).ok()?;
    }
    Some((
        (rc.right - rc.left).max(0) as u32,
        (rc.bottom - rc.top).max(0) as u32,
    ))
}

fn run_gpu_job(mut job: GpuJob) -> Gpu {
    if let Some((w, h)) = job.resize {
        if let Err(e) = job.gpu.resize(w, h) {
            tracing::error!(error = %e, w, h, "投屏 swapchain resize 失败");
        }
    }
    if let Some(c) = job.clip {
        match job
            .gpu
            .set_occupancy_clip(c.x, c.y, c.w, c.h, c.radius, c.motion)
        {
            Ok(true) if c.motion.interpolates() => tracing::info!(
                clip_x = c.x,
                clip_y = c.y,
                clip_w = c.w,
                clip_h = c.h,
                ?c.motion,
                spec = ?c.motion.spec(),
                "投屏占用盒 DComp clip"
            ),
            Ok(_) => {}
            Err(e) => tracing::warn!(error = %e, "投屏占用 clip 失败"),
        }
    }
    if let Some((dest, letterbox)) = job.replay {
        job.gpu.set_letterbox_argb(letterbox);
        if let Err(e) = job.gpu.replay_last(dest) {
            tracing::debug!(error = %e, "投屏 resize 后重画上一帧失败");
        }
    }
    job.gpu
}

fn finish_gpu(hwnd: HWND, gpu: Gpu) {
    let _ = with_host(hwnd, |h| h.gpu = Some(gpu));
}

pub fn follow_host_size(hwnd: HWND) {
    let job = with_host(hwnd, |h| h.plan_gpu(hwnd, OccupancyMotion::Follow)).flatten();
    if let Some(job) = job {
        finish_gpu(hwnd, run_gpu_job(job));
    }
}

/// 侧栏只改 DComp clip；HWND 只在主窗客户区变化时 SetWindowPos。
pub fn flush_occupancy(hwnd: HWND) {
    let Some((geom, serial, motion)) = with_host(hwnd, |h| {
        let motion = h.stage.occupancy_motion();
        h.write_geom_visible();
        (Arc::clone(&h.geom), h.stage.serial.clone(), motion)
    }) else {
        return;
    };
    geom.place_owned(&serial);
    let job = with_host(hwnd, |h| h.plan_gpu(hwnd, motion)).flatten();
    if let Some(job) = job {
        finish_gpu(hwnd, run_gpu_job(job));
    }
}

pub fn apply_pointer(hwnd: HWND, kind: MirrorPointerKind, x: i32, y: i32) {
    let _ = with_host(hwnd, |h| h.handle_wire_pointer(kind, x, y));
}

pub fn screenshot_hwnd(hwnd: HWND, path: &str) -> Result<(), PresentError> {
    let gpu = with_host(hwnd, |h| h.gpu.take()).flatten();
    let Some(mut gpu) = gpu else {
        return screenshot_from_pixels(path, None);
    };
    let pixels = gpu
        .screenshot_bgra()
        .map_err(|e| PresentError::Internal(e.to_string()));
    let _ = with_host(hwnd, |h| h.gpu = Some(gpu));
    screenshot_from_pixels(path, pixels?)
}

fn slot_of(hwnd: HWND) -> Option<&'static Slot> {
    unsafe {
        let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        if ptr == 0 {
            return None;
        }
        Some(&*(ptr as *const Slot))
    }
}

pub fn with_host<R>(hwnd: HWND, f: impl FnOnce(&mut Host) -> R) -> Option<R> {
    let slot = slot_of(hwnd)?;
    let mut guard = slot.host.lock().ok()?;
    Some(f(&mut guard))
}

pub fn install(hwnd: HWND, host: Host) {
    let state = Box::new(Slot {
        host: Mutex::new(host),
    });
    unsafe {
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, Box::into_raw(state) as isize);
    }
}

pub fn uninstall(hwnd: HWND) -> Option<String> {
    with_host(hwnd, |h| h.end_press());
    unsafe {
        let ptr = SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
        if ptr == 0 {
            return None;
        }
        let boxed = Box::from_raw(ptr as *mut Slot);
        let host = boxed.host.into_inner().unwrap_or_else(|p| p.into_inner());
        Some(host.stage.serial)
    }
}

pub fn present_picture(
    hwnd: HWND,
    content_w: u32,
    content_h: u32,
    picture_w: u32,
    picture_h: u32,
    picture: DecodedPicture,
) -> bool {
    let size_changed =
        with_host(hwnd, |h| h.stage.set_video_size(content_w, content_h)).unwrap_or(false);
    if size_changed {
        flush_occupancy(hwnd);
    }
    let prepared = with_host(hwnd, |h| h.prepare_video(content_w, content_h)).flatten();
    let Some((mut gpu, dest, letterbox)) = prepared else {
        return false;
    };
    gpu.set_letterbox_argb(letterbox);
    let drawn = match &picture {
        DecodedPicture::Nv12(nv12) => {
            gpu.present_cpu_nv12(picture_w, picture_h, content_w, content_h, nv12, dest)
        }
        DecodedPicture::Gpu {
            texture,
            subresource,
            ..
        } => gpu.present_gpu_nv12(content_w, content_h, texture, *subresource, dest),
    };
    let presented = drawn.is_ok();
    let mut show = false;
    with_host(hwnd, |h| {
        h.gpu = Some(gpu);
        show = h.commit_video(content_w, content_h, presented, drawn.as_ref().err());
    });
    if show {
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
    }
    presented
}

pub fn present_chrome(hwnd: HWND, spin: f32) {
    let prepared = with_host(hwnd, |h| {
        let draw = h.prepare_chrome()?;
        let gpu = h.gpu.take()?;
        Some((draw, gpu))
    })
    .flatten();
    let Some((draw, mut gpu)) = prepared else {
        return;
    };
    let spec = draw.spec(spin);
    let ok = if let Err(e) = gpu.present_chrome(&spec) {
        tracing::warn!(error = %e, "投屏 chrome Present 失败");
        false
    } else {
        true
    };
    let _ = with_host(hwnd, |h| h.gpu = Some(gpu));
    if ok {
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
    }
}

pub fn loading(hwnd: HWND) -> bool {
    with_host(hwnd, |h| h.stage.mode() == MirrorStageMode::Loading).unwrap_or(false)
}
