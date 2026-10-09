//! Stage 宿主。解码与 GTK 都不在这里。

use std::sync::{Arc, Mutex};
use std::time::Instant;

use tokio::sync::mpsc as tokio_mpsc;
use yohu_mirror::MirrorService;
use yohu_motion::MotionSpec;
use yohu_protocol::{AppEvent, MirrorLayout, MirrorPointerKind};

use super::super::backend::{bind_after_frame, publish_bind, PresentBind};
use super::super::control_hand::{deliver_pointer, lift_press, lift_without_control, ControlHand};
use super::super::present_beat::{
    open_pipe, present_miss, release_pipe, settle_presented_frame, PresentBeat,
};
use super::super::scale::Letterbox;
use super::super::stage::{stage_palette, stage_type_px, OccupancyMotion, PictureAdmit, Stage};
use super::color::{scale_bgra, OwnedYuv};
use crate::mirror_present::{screenshot_from_pixels, PresentError};

pub struct LayoutSnap {
    pub avail_x: i32,
    pub avail_y: i32,
    pub avail_w: u32,
    pub avail_h: u32,
    /// 占用卡片，相对 avail。Fill 铺满洞；有内容尺寸后是 contain。
    pub dest: Letterbox,
    pub radius: f32,
    pub stroke: f32,
    pub border: u32,
    /// 铬卡片填充。对齐舞台 surface，不是洞外边。
    pub canvas: u32,
    /// 卡片外 letterbox。对齐窗口 `--yohu-canvas`（WebView 透出的底），不是舞台 surface。
    pub page: u32,
    pub title_argb: u32,
    pub body_argb: u32,
    pub icon_argb: u32,
    pub well_argb: u32,
    pub chrome: bool,
    pub video: bool,
    pub loading: bool,
    pub title: &'static str,
    pub description: String,
    pub icon_px: u32,
    pub title_px: u32,
    pub body_px: u32,
    /// Fill↔Dest 进行中。画面仍画在 `dest`，描边和铬跟这条插值。
    pub motion: Option<CardMotion>,
}

/// 占用卡片从上一拍插到这一拍。曲线与 Windows DComp clip 同一 `MotionSpec`。
#[derive(Clone)]
pub struct CardMotion {
    pub from: Letterbox,
    pub to: Letterbox,
    pub(crate) started: Instant,
    pub(crate) spec: MotionSpec,
}

impl CardMotion {
    pub fn sample(&self) -> Letterbox {
        let e = self.spec.ease_at(self.started.elapsed());
        if e >= 1.0 {
            return self.to;
        }
        lerp_box(self.from, self.to, e)
    }

    pub fn running(&self) -> bool {
        self.spec.ease_at(self.started.elapsed()) < 1.0
    }
}

fn lerp_box(from: Letterbox, to: Letterbox, e: f32) -> Letterbox {
    let mix = |a: i32, b: i32| a + ((b - a) as f32 * e).round() as i32;
    let mix_u = |a: u32, b: u32| mix(a as i32, b as i32).max(0) as u32;
    Letterbox {
        x: mix(from.x, to.x),
        y: mix(from.y, to.y),
        width: mix_u(from.width, to.width).max(1),
        height: mix_u(from.height, to.height).max(1),
        nearest: to.nearest,
        crop_w: to.crop_w,
        crop_h: to.crop_h,
    }
}

fn box_close(a: Letterbox, b: Letterbox) -> bool {
    (a.x - b.x).abs() <= 1
        && (a.y - b.y).abs() <= 1
        && a.width.abs_diff(b.width) <= 1
        && a.height.abs_diff(b.height) <= 1
}

/// Follow 且目标没变时留着进行中的插值。Fill↔Dest 从当前看到的盒子起跳。
pub(super) fn settle_card(
    current: Option<CardMotion>,
    settled: Letterbox,
    kind: OccupancyMotion,
    to: Letterbox,
) -> Option<CardMotion> {
    let seen = current.as_ref().map(CardMotion::sample).unwrap_or(settled);
    if let Some(spec) = kind.spec() {
        if box_close(seen, to) {
            return None;
        }
        return Some(CardMotion {
            from: seen,
            to,
            started: Instant::now(),
            spec,
        });
    }
    if current
        .as_ref()
        .is_some_and(|motion| motion.running() && box_close(motion.to, to))
    {
        return current;
    }
    None
}

fn empty_box() -> Letterbox {
    Letterbox {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        nearest: false,
        crop_w: 0,
        crop_h: 0,
    }
}

/// 卡片外的窗口底。与 `tokens` 里和 `--yohu-canvas` 孪生的 RGB 同一套。
pub fn page_argb(dark: bool) -> u32 {
    let (r, g, b) = if dark {
        crate::tokens::CANVAS_DARK_RGB
    } else {
        crate::tokens::CANVAS_LIGHT_RGB
    };
    0xFF00_0000 | (u32::from(r) << 16) | (u32::from(g) << 8) | u32::from(b)
}

pub struct Host {
    pub stage: Stage,
    last_yuv: Option<OwnedYuv>,
    hand: ControlHand,
    beat: PresentBeat,
    event_tx: tokio_mpsc::Sender<AppEvent>,
    bind: Arc<Mutex<PresentBind>>,
    published: Option<PresentBind>,
    card_anim: Option<CardMotion>,
    card_settled: Letterbox,
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
            card_anim: None,
            card_settled: empty_box(),
        }
    }

    pub fn apply_layout(&mut self, layout: &MirrorLayout) {
        self.stage.apply_layout(layout);
        self.stage.set_host_size(layout.width, layout.height);
        lift_without_control(&self.stage, &mut self.hand);
        if self.stage.has_frame() {
            self.publish(bind_after_frame(!self.stage.shows_video()));
        }
        self.poke_card();
    }

    pub fn bind(&mut self, serial: String, generation: u64) {
        open_pipe(&mut self.beat, &mut self.stage, serial, generation);
    }

    pub fn unbind(&mut self, target: &str) -> bool {
        let removed = release_pipe(&mut self.stage, &mut self.hand, target);
        if removed {
            self.last_yuv = None;
            self.poke_card();
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
        self.adopt_content(width, height);
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
        let (icon_px, title_px, body_px) = stage_type_px(self.stage.dpr());
        let pal = stage_palette(self.stage.dark());
        let (stroke, border) = self.stage.panel_stroke();
        let (avail_x, avail_y, avail_w, avail_h) = self.stage.avail();
        LayoutSnap {
            avail_x,
            avail_y,
            avail_w,
            avail_h,
            dest: self.stage.dest_in_avail(),
            radius: self.stage.corner_radius() as f32,
            stroke,
            border,
            canvas: pal.canvas_argb,
            page: page_argb(self.stage.dark()),
            title_argb: pal.title_argb,
            body_argb: pal.body_argb,
            icon_argb: pal.icon_argb,
            well_argb: pal.well_argb,
            chrome: self.stage.shows_chrome(),
            video: self.stage.shows_video() && self.last_yuv.is_some(),
            loading: self.stage.is_loading(),
            title,
            description,
            icon_px,
            title_px,
            body_px,
            motion: self.card_anim.clone(),
        }
    }

    pub fn adopt_content(&mut self, width: u32, height: u32) {
        self.stage.adopt_encoded_size(width, height);
        self.poke_card();
    }

    fn poke_card(&mut self) {
        let kind = self.stage.occupancy_motion();
        let to = self.stage.dest_in_avail();
        self.card_anim = settle_card(self.card_anim.take(), self.card_settled, kind, to);
        let Some(motion) = self.card_anim.clone() else {
            self.card_settled = to;
            return;
        };
        if kind.interpolates() {
            tracing::info!(
                from_w = motion.from.width,
                from_h = motion.from.height,
                to_w = motion.to.width,
                to_h = motion.to.height,
                ms = motion.spec.duration_ms(),
                "投屏占用卡片开始插值"
            );
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

#[cfg(test)]
mod tests {
    use super::{box_close, empty_box, lerp_box, page_argb, settle_card, CardMotion};
    use crate::mirror_present::scale::Letterbox;
    use crate::mirror_present::stage::OccupancyMotion;
    use yohu_motion::MotionSpec;

    fn box_at(x: i32, y: i32, w: u32, h: u32) -> Letterbox {
        Letterbox {
            x,
            y,
            width: w,
            height: h,
            nearest: false,
            crop_w: 0,
            crop_h: 0,
        }
    }

    #[test]
    fn letterbox_is_window_canvas_not_stage_surface() {
        assert_eq!(page_argb(false), 0xFFF1_F3F5);
        assert_eq!(page_argb(true), 0xFF19_1A1C);
        assert_ne!(page_argb(false), 0xFFFF_FFFF);
        assert_ne!(page_argb(true), 0xFF20_2224);
    }

    #[test]
    fn fill_to_dest_starts_from_the_settled_card() {
        let from = box_at(0, 0, 700, 660);
        let to = box_at(166, 0, 372, 660);
        let motion = settle_card(None, from, OccupancyMotion::FillToDest, to).expect("anim");
        assert!(box_close(motion.from, from));
        assert!(box_close(motion.to, to));
        assert_eq!(motion.spec, MotionSpec::SpatialPanel);
        assert!(box_close(motion.sample(), from));
    }

    #[test]
    fn dest_to_fill_uses_the_enter_spec() {
        let from = box_at(166, 0, 372, 660);
        let to = box_at(0, 0, 700, 660);
        let motion = settle_card(None, from, OccupancyMotion::DestToFill, to).expect("anim");
        assert_eq!(motion.spec, MotionSpec::SpatialEnter);
        assert!(box_close(motion.from, from));
        assert!(box_close(motion.to, to));
    }

    #[test]
    fn follow_keeps_a_running_card_when_the_target_is_unchanged() {
        let from = box_at(0, 0, 700, 660);
        let to = box_at(166, 0, 372, 660);
        let started = settle_card(None, from, OccupancyMotion::FillToDest, to).expect("anim");
        let kept = settle_card(Some(started), from, OccupancyMotion::Follow, to).expect("kept");
        assert!(box_close(kept.to, to));
        assert!(settle_card(
            Some(kept),
            from,
            OccupancyMotion::Follow,
            box_at(0, 0, 10, 10)
        )
        .is_none());
    }

    #[test]
    fn finished_sample_is_the_dest_card() {
        let from = box_at(0, 0, 100, 100);
        let to = box_at(40, 10, 20, 80);
        let motion = CardMotion {
            from,
            to,
            started: std::time::Instant::now()
                - std::time::Duration::from_millis(MotionSpec::SpatialPanel.duration_ms() + 5),
            spec: MotionSpec::SpatialPanel,
        };
        assert!(!motion.running());
        assert!(box_close(motion.sample(), to));
        assert!(box_close(lerp_box(from, to, 1.0), to));
        assert_eq!(empty_box().width, 1);
    }
}
