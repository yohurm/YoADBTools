//! Stage 宿主：占用 / chrome / 输入 / 截图。解码管道不在这里。

use std::sync::Arc;
use std::time::Instant;

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::MirrorService;
use yohu_protocol::{AppEvent, MirrorControlMessage, MirrorLayout, MirrorPointerKind};

use super::super::pointer::{PointerGesture, PointerKind, TouchOut};
use super::super::scale::{map_client_to_video, Letterbox};
use super::super::stage::{stage_copy, stage_palette, stage_type_px, Stage};
use super::vt::Picture;
use crate::mirror_present::{screenshot_from_pixels, PresentError};

pub struct LayoutSnap {
    pub avail_x: i32,
    pub avail_y: i32,
    pub avail_w: u32,
    pub avail_h: u32,
    pub dpr: f32,
    pub host_h: u32,
    pub occ: (i32, i32, u32, u32),
    pub dest: Letterbox,
    pub content_w: u32,
    pub content_h: u32,
    pub radius: f32,
    pub stroke: f32,
    pub border: u32,
    pub canvas: u32,
    pub title_argb: u32,
    pub body_argb: u32,
    pub dark: bool,
    pub chrome: bool,
    pub video: bool,
    pub loading: bool,
    pub title: &'static str,
    pub description: String,
    pub icon_px: u32,
    pub title_px: u32,
    pub body_px: u32,
}

pub struct Host {
    pub stage: Stage,
    last_pic: Option<Picture>,
    gesture: PointerGesture,
    painted: u32,
    fps_at: Instant,
    present_err_logged: bool,
    mirror: Arc<MirrorService>,
    event_tx: tokio_mpsc::Sender<AppEvent>,
}

impl Host {
    pub fn new(
        serial: String,
        mirror: Arc<MirrorService>,
        event_tx: tokio_mpsc::Sender<AppEvent>,
    ) -> Self {
        Self {
            stage: Stage::new(serial),
            last_pic: None,
            gesture: PointerGesture::default(),
            painted: 0,
            fps_at: Instant::now(),
            present_err_logged: false,
            mirror,
            event_tx,
        }
    }

    pub fn apply_layout(&mut self, layout: &MirrorLayout) {
        self.stage.apply_layout(layout);
        self.stage.set_host_size(layout.width, layout.height);
        if !self.stage.control() {
            self.end_press();
        }
        tracing::debug!(
            serial = %self.stage.serial,
            x = layout.x,
            y = layout.y,
            w = layout.width,
            h = layout.height,
            visible = layout.visible,
            dpr = layout.dpr,
            "投屏可用区已交给 macOS 表面"
        );
    }

    pub fn bind(&mut self, serial: String, generation: u64) {
        self.stage.bind(serial, generation);
        self.present_err_logged = false;
        self.painted = 0;
        tracing::info!(
            serial = %self.stage.serial,
            generation,
            "投屏解码管道已绑定"
        );
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
                "投屏在解码前记下编码尺寸"
            );
        }
    }

    pub fn present_picture(&mut self, pic: Picture) -> bool {
        let width = pic.width;
        let height = pic.height;
        if !self.stage.presentable() || !self.stage.allows_video_present() {
            return false;
        }
        self.last_pic = Some(pic);
        self.commit_video(width, height, true);
        true
    }

    pub fn screenshot(&self, path: &str) -> Result<(), PresentError> {
        let Some(pic) = self.last_pic.as_ref() else {
            return screenshot_from_pixels(path, None);
        };
        let bgra = pic.copy_bgra().map_err(PresentError::Internal)?;
        screenshot_from_pixels(path, Some((pic.width, pic.height, bgra)))
    }

    pub fn layout_snap(&self) -> LayoutSnap {
        let (title, description) = stage_copy(
            self.stage.mode(),
            self.stage.has_device(),
            self.stage.failed(),
            self.stage.error(),
            {
                let (w, h) = self.stage.video_size();
                w > 0 && h > 0
            },
        );
        let (icon_px, title_px, body_px) = stage_type_px(self.stage.dpr());
        let (host_w, host_h) = self.stage.host_size();
        let _ = host_w;
        let pal = stage_palette(self.stage.dark());
        let (stroke, border) = self.stage.panel_stroke();
        let (avail_x, avail_y, avail_w, avail_h) = self.stage.avail();
        let (content_w, content_h) = self.stage.video_size();
        LayoutSnap {
            avail_x,
            avail_y,
            avail_w,
            avail_h,
            dpr: self.stage.dpr(),
            host_h,
            occ: self.stage.occupancy_in_avail(),
            dest: self.stage.dest_in_avail(),
            content_w,
            content_h,
            radius: self.stage.corner_radius() as f32,
            stroke,
            border,
            canvas: pal.canvas_argb,
            title_argb: pal.title_argb,
            body_argb: pal.body_argb,
            dark: self.stage.dark(),
            chrome: self.stage.shows_chrome(),
            video: self.stage.shows_video(),
            loading: self.stage.mode() == yohu_protocol::MirrorStageMode::Loading,
            title,
            description,
            icon_px,
            title_px,
            body_px,
        }
    }

    pub fn handle_wire_pointer(&mut self, kind: MirrorPointerKind, x: i32, y: i32) {
        match kind {
            MirrorPointerKind::Leave => self.handle_leave(),
            MirrorPointerKind::Down => self.feed_parent_pointer(PointerKind::Down, x, y),
            MirrorPointerKind::Move => self.feed_parent_pointer(PointerKind::Move, x, y),
            MirrorPointerKind::Up => self.feed_parent_pointer(PointerKind::Up, x, y),
        }
    }

    fn feed_parent_pointer(&mut self, kind: PointerKind, x: i32, y: i32) {
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

    fn commit_video(&mut self, width: u32, height: u32, presented: bool) -> bool {
        if !presented {
            if !self.present_err_logged {
                self.present_err_logged = true;
                tracing::warn!(width, height, "投屏 Present 失败");
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
}
