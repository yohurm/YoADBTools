//! Stage 宿主：占用 / chrome / 输入 / 截图。解码管道不在这里。

use std::sync::Arc;

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::MirrorService;
use yohu_protocol::{AppEvent, MirrorLayout, MirrorPointerKind};

use super::super::control_hand::{deliver_pointer, lift_press, lift_without_control, ControlHand};
use super::super::present_beat::{
    open_pipe, release_pipe, settle_presented_frame, PresentBeat, PresentMiss,
};
use super::super::scale::Letterbox;
use super::super::stage::{stage_palette, stage_type_px, PictureAdmit, Stage};
use super::vt::Picture;
use crate::mirror_present::{screenshot_sampled, PresentError};

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
    #[allow(dead_code)]
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
    hand: ControlHand,
    beat: PresentBeat,
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
            hand: ControlHand::new(mirror),
            beat: PresentBeat::new(),
            event_tx,
        }
    }

    pub fn apply_layout(&mut self, layout: &MirrorLayout) {
        self.stage.apply_layout(layout);
        self.stage.set_host_size(layout.width, layout.height);
        lift_without_control(&self.stage, &mut self.hand);
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
        open_pipe(&mut self.beat, &mut self.stage, serial, generation);
    }

    pub fn unbind(&mut self, target: &str) -> bool {
        release_pipe(&mut self.stage, &mut self.hand, target)
    }

    pub fn present_picture(&mut self, pic: Picture) -> bool {
        let width = pic.width;
        let height = pic.height;
        if self.stage.admit_picture() != PictureAdmit::Ready {
            return false;
        }
        self.last_pic = Some(pic);
        self.commit_video(width, height, true);
        true
    }

    pub fn screenshot(&self, path: &str) -> Result<(), PresentError> {
        let sample = self.last_pic.as_ref().map(|pic| {
            pic.copy_bgra()
                .map(|bgra| (pic.width, pic.height, bgra))
                .map_err(|_| ())
        });
        screenshot_sampled(path, sample)
    }

    pub fn layout_snap(&self) -> LayoutSnap {
        let (title, description) = self.stage.copy();
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
            loading: self.stage.is_loading(),
            title,
            description,
            icon_px,
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

    fn commit_video(&mut self, width: u32, height: u32, presented: bool) -> bool {
        settle_presented_frame(
            &mut self.beat,
            &mut self.stage,
            &self.event_tx,
            width,
            height,
            presented,
            PresentMiss::Announce(None),
        )
    }
}
