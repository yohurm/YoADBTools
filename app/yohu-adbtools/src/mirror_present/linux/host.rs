//! Stage 宿主。解码与 GTK 都不在这里。

use std::sync::{Arc, Mutex};

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::MirrorService;
use yohu_protocol::{AppEvent, MirrorLayout, MirrorPointerKind};

use super::super::backend::{bind_after_frame, publish_bind, PresentBind};
use super::super::control_hand::{deliver_pointer, lift_press, lift_without_control, ControlHand};
use super::super::present_beat::{
    open_pipe, present_miss, release_pipe, settle_presented_frame, PresentBeat,
};
use super::super::scale::Letterbox;
use super::super::stage::{stage_palette, stage_type_px, PictureAdmit, Stage};
use super::color::{scale_bgra, OwnedYuv};
use crate::mirror_present::{screenshot_from_pixels, PresentError};

pub struct LayoutSnap {
    pub avail_x: i32,
    pub avail_y: i32,
    pub avail_w: u32,
    pub avail_h: u32,
    pub dest: Letterbox,
    pub canvas: u32,
    pub title_argb: u32,
    pub body_argb: u32,
    pub chrome: bool,
    pub video: bool,
    pub title: &'static str,
    pub description: String,
    pub title_px: u32,
    pub body_px: u32,
}

pub struct Host {
    pub stage: Stage,
    last_yuv: Option<OwnedYuv>,
    hand: ControlHand,
    beat: PresentBeat,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    bind: Arc<Mutex<PresentBind>>,
    published: Option<PresentBind>,
}

impl Host {
    pub fn new(
        serial: String,
        mirror: Arc<MirrorService>,
        event_tx: tokio_mpsc::Sender<AppEvent>,
        bind: Arc<Mutex<PresentBind>>,
    ) -> Self {
        Self {
            stage: Stage::new(serial),
            last_yuv: None,
            hand: ControlHand::new(mirror),
            beat: PresentBeat::new(),
            event_tx,
            bind,
            published: None,
        }
    }

    pub fn apply_layout(&mut self, layout: &MirrorLayout) {
        self.stage.apply_layout(layout);
        self.stage.set_host_size(layout.width, layout.height);
        lift_without_control(&self.stage, &mut self.hand);
        if self.stage.has_frame() {
            self.publish(bind_after_frame(!self.stage.shows_video()));
        }
    }

    pub fn bind(&mut self, serial: String, generation: u64) {
        open_pipe(&mut self.beat, &mut self.stage, serial, generation);
    }

    pub fn unbind(&mut self, target: &str) -> bool {
        let removed = release_pipe(&mut self.stage, &mut self.hand, target);
        if removed {
            self.last_yuv = None;
            self.publish(PresentBind::Idle);
        }
        removed
    }

    pub fn publish(&mut self, next: PresentBind) {
        if self.published.as_ref() == Some(&next) {
            return;
        }
        self.published = Some(next.clone());
        publish_bind(
            &self.bind,
            next,
            &Some(self.event_tx.clone()),
            &self.stage.serial,
        );
    }

    /// 解码图先收下。布局还没到、或暂停，不记首帧。
    pub fn take_picture(&mut self, yuv: OwnedYuv) -> bool {
        let width = yuv.width;
        let height = yuv.height;
        self.stage.adopt_encoded_size(width, height);
        if self.stage.admit_picture() != PictureAdmit::Ready {
            self.last_yuv = Some(yuv);
            return false;
        }
        self.last_yuv = Some(yuv);
        let shown = settle_presented_frame(
            &mut self.beat,
            &mut self.stage,
            &self.event_tx,
            width,
            height,
            true,
            present_miss(None),
        );
        self.publish(bind_after_frame(!self.stage.shows_video()));
        shown || self.stage.has_frame()
    }

    pub fn screenshot(&self, path: &str) -> Result<(), PresentError> {
        let pixels = self.last_yuv.as_ref().map(|yuv| {
            let dest = Letterbox {
                x: 0,
                y: 0,
                width: yuv.width,
                height: yuv.height,
                nearest: true,
                crop_w: yuv.width,
                crop_h: yuv.height,
            };
            (yuv.width, yuv.height, scale_bgra(yuv, dest))
        });
        screenshot_from_pixels(path, pixels)
    }

    pub fn layout_snap(&self) -> LayoutSnap {
        let (title, description) = self.stage.copy();
        let (_, title_px, body_px) = stage_type_px(self.stage.dpr());
        let pal = stage_palette(self.stage.dark());
        let (avail_x, avail_y, avail_w, avail_h) = self.stage.avail();
        LayoutSnap {
            avail_x,
            avail_y,
            avail_w,
            avail_h,
            dest: self.stage.dest_in_avail(),
            canvas: pal.canvas_argb,
            title_argb: pal.title_argb,
            body_argb: pal.body_argb,
            chrome: self.stage.shows_chrome(),
            video: self.stage.shows_video() && self.last_yuv.is_some(),
            title,
            description,
            title_px,
            body_px,
        }
    }

    pub fn handle_wire_pointer(&mut self, kind: MirrorPointerKind, x: i32, y: i32) {
        deliver_pointer(&self.stage, &mut self.hand, kind, x, y);
    }

    pub fn end_press(&mut self) {
        lift_press(&self.stage, &mut self.hand);
    }

    pub fn paint_source(&self) -> Option<&OwnedYuv> {
        self.last_yuv.as_ref()
    }
}
