//! 舞台模型：占用 / 模式 / chrome。与 OS 无关，不进 `MirrorLayout`。
//!
//! 解码是否绑定（`bound`）是管道投影，只在 BindPipe/UnbindPipe 时写入，禁止另开 bool 双轨。
#![cfg_attr(not(windows), allow(dead_code))]

use yohu_motion::MotionSpec;
use yohu_protocol::{MirrorLayout, MirrorStageMode, MIRROR_MIN_LAYOUT_PX};

use super::scale::{present_dest, Letterbox};

pub use super::stage_copy::stage_copy;
pub use super::stage_palette::{
    argb_to_rgba, host_corner_radius, stage_border_argb, stage_palette, stage_stroke_px,
    stage_type_px,
};

pub struct ChromeSpec<'a> {
    pub mode: MirrorStageMode,
    pub title: &'a str,
    pub description: &'a str,
    pub canvas_argb: u32,
    pub title_argb: u32,
    pub body_argb: u32,
    pub icon_argb: u32,
    pub well_argb: u32,
    pub icon_px: u32,
    pub title_px: u32,
    pub body_px: u32,
    pub spin: f32,
}

/// HWND chrome 一次绘制所需的自有文案（锁外再借成 [`ChromeSpec`]）。
pub struct ChromeDraw {
    pub mode: MirrorStageMode,
    pub title: &'static str,
    pub description: String,
    pub canvas_argb: u32,
    pub title_argb: u32,
    pub body_argb: u32,
    pub icon_argb: u32,
    pub well_argb: u32,
    pub icon_px: u32,
    pub title_px: u32,
    pub body_px: u32,
}

impl ChromeDraw {
    pub fn spec(&self, spin: f32) -> ChromeSpec<'_> {
        ChromeSpec {
            mode: self.mode,
            title: self.title,
            description: &self.description,
            canvas_argb: self.canvas_argb,
            title_argb: self.title_argb,
            body_argb: self.body_argb,
            icon_argb: self.icon_argb,
            well_argb: self.well_argb,
            icon_px: self.icon_px,
            title_px: self.title_px,
            body_px: self.body_px,
            spin,
        }
    }
}

/// 铬垂直栈与行盒：Win D2D 与 macOS AppKit 共用。
pub struct ChromeStack {
    pub gap: f32,
    pub block: f32,
    pub title_inset: f32,
    pub body_inset: f32,
    pub title_box: f32,
    pub body_box: f32,
    pub after_title: f32,
    /// 行宽 / 行高下限，对齐 `tokens::SPACE_SM`。
    pub row_min: f32,
}

const TITLE_LEADING: f32 = 1.4;
const BODY_LEADING: f32 = 2.6;
const AFTER_TITLE: f32 = 0.35;

pub fn chrome_stack(icon: f32, title: f32, body: f32) -> ChromeStack {
    let gap = (title * 0.75).max(crate::tokens::SPACE_SM as f32);
    let title_box = title * TITLE_LEADING;
    let body_box = body * BODY_LEADING;
    let after_title = gap * AFTER_TITLE;
    ChromeStack {
        gap,
        block: icon + gap + title_box + after_title + body_box,
        title_inset: crate::tokens::SPACE_LG as f32,
        body_inset: crate::tokens::SPACE_XL as f32,
        title_box,
        body_box,
        after_title,
        row_min: crate::tokens::SPACE_SM as f32,
    }
}

/// 占用盒子种类：铺满 avail，或 contain dest。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OccupancyKind {
    Fill,
    Dest,
}

impl OccupancyKind {
    pub fn of(bound: bool, video_w: u32, video_h: u32) -> Self {
        if bound && video_w > 0 && video_h > 0 {
            Self::Dest
        } else {
            Self::Fill
        }
    }
}

/// 占用运动：同 kind 跟 avail；Fill→Dest 与 Dest→Fill 分进场/出场规格。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OccupancyMotion {
    Follow,
    FillToDest,
    DestToFill,
}

impl OccupancyMotion {
    pub fn from_kind_change(prev: Option<OccupancyKind>, next: OccupancyKind) -> Self {
        match (prev, next) {
            (Some(OccupancyKind::Fill), OccupancyKind::Dest) => Self::FillToDest,
            (Some(OccupancyKind::Dest), OccupancyKind::Fill) => Self::DestToFill,
            _ => Self::Follow,
        }
    }

    pub fn interpolates(self) -> bool {
        matches!(self, Self::FillToDest | Self::DestToFill)
    }

    /// Fill→Dest 是共享容器换形；Dest→Fill 是空态进场，不共用标准曲线。
    pub fn spec(self) -> Option<MotionSpec> {
        match self {
            Self::Follow => None,
            Self::FillToDest => Some(MotionSpec::SpatialPanel),
            Self::DestToFill => Some(MotionSpec::SpatialEnter),
        }
    }
}

/// 舞台可见性寿命上的状态（HWND 在）；解码寿命只体现在 `bound` / 画面尺寸。
pub struct Stage {
    pub serial: String,
    pub generation: u64,
    visible: bool,
    avail_x: i32,
    avail_y: i32,
    avail_w: u32,
    avail_h: u32,
    dpr: f32,
    fullscreen: bool,
    paused: bool,
    has_device: bool,
    failed: bool,
    error: String,
    dark: bool,
    want_control: bool,
    host_w: u32,
    host_h: u32,
    bound: bool,
    video_w: u32,
    video_h: u32,
    has_frame: bool,
    mode: MirrorStageMode,
    last_occupancy_kind: Option<OccupancyKind>,
}

impl Stage {
    pub fn new(serial: String) -> Self {
        Self {
            serial,
            generation: 0,
            visible: false,
            avail_x: 0,
            avail_y: 0,
            avail_w: 0,
            avail_h: 0,
            dpr: 1.0,
            fullscreen: false,
            paused: false,
            has_device: false,
            failed: false,
            error: String::new(),
            dark: false,
            want_control: false,
            host_w: 0,
            host_h: 0,
            bound: false,
            video_w: 0,
            video_h: 0,
            has_frame: false,
            mode: MirrorStageMode::Empty,
            last_occupancy_kind: None,
        }
    }

    pub fn apply_layout(&mut self, layout: &MirrorLayout) {
        if !layout.serial.is_empty() {
            self.serial = layout.serial.clone();
        }
        self.want_control = layout.control;
        self.visible = layout.visible;
        self.avail_x = layout.x;
        self.avail_y = layout.y;
        self.avail_w = layout.width;
        self.avail_h = layout.height;
        self.dpr = layout.dpr;
        self.fullscreen = layout.fullscreen;
        self.paused = layout.paused;
        self.has_device = layout.has_device;
        self.failed = layout.failed;
        self.error = layout.error.clone();
        self.dark = layout.dark;
        self.refresh();
    }

    pub fn bind(&mut self, serial: String, generation: u64) {
        self.serial = serial;
        self.generation = generation;
        self.bound = true;
        self.has_frame = false;
        self.refresh();
    }

    pub fn unbind(&mut self) {
        self.bound = false;
        self.has_frame = false;
        self.generation = 0;
        self.refresh();
    }

    pub fn set_video_size(&mut self, width: u32, height: u32) -> bool {
        if self.video_w == width && self.video_h == height {
            return false;
        }
        self.video_w = width;
        self.video_h = height;
        true
    }

    pub fn mark_frame(&mut self) {
        self.has_frame = true;
        self.refresh();
    }

    pub fn set_host_size(&mut self, width: u32, height: u32) -> bool {
        if self.host_w == width && self.host_h == height {
            return false;
        }
        self.host_w = width;
        self.host_h = height;
        true
    }

    fn refresh(&mut self) {
        self.mode = stage_mode(self.paused, self.bound, self.has_frame);
    }

    pub fn mode(&self) -> MirrorStageMode {
        self.mode
    }

    pub fn bound(&self) -> bool {
        self.bound
    }

    pub fn visible(&self) -> bool {
        self.visible
    }

    pub fn has_frame(&self) -> bool {
        self.has_frame
    }

    pub fn video_size(&self) -> (u32, u32) {
        (self.video_w, self.video_h)
    }

    pub fn dpr(&self) -> f32 {
        self.dpr
    }

    pub fn has_device(&self) -> bool {
        self.has_device
    }

    pub fn failed(&self) -> bool {
        self.failed
    }

    pub fn error(&self) -> &str {
        &self.error
    }

    pub fn dark(&self) -> bool {
        self.dark
    }

    pub fn host_size(&self) -> (u32, u32) {
        (self.host_w, self.host_h)
    }

    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub fn avail(&self) -> (i32, i32, u32, u32) {
        (self.avail_x, self.avail_y, self.avail_w, self.avail_h)
    }

    pub fn corner_radius(&self) -> u32 {
        host_corner_radius(self.fullscreen, self.dpr())
    }

    pub fn presentable(&self) -> bool {
        self.visible && self.host_w >= MIRROR_MIN_LAYOUT_PX && self.host_h >= MIRROR_MIN_LAYOUT_PX
    }

    pub fn shows_chrome(&self) -> bool {
        matches!(
            self.mode,
            MirrorStageMode::Empty | MirrorStageMode::Loading | MirrorStageMode::Paused
        )
    }

    pub fn shows_video(&self) -> bool {
        self.mode == MirrorStageMode::Video
    }

    /// 解码图可画：Loading 首帧也要 Present，之后 `mark_frame` 才进 Video。
    pub fn allows_video_present(&self) -> bool {
        !matches!(self.mode, MirrorStageMode::Empty | MirrorStageMode::Paused)
    }

    pub fn control(&self) -> bool {
        self.want_control && self.mode == MirrorStageMode::Video
    }

    pub fn occupancy(&self) -> (i32, i32, u32, u32) {
        let d = self.dest();
        (d.x, d.y, d.width, d.height)
    }

    /// 占用盒相对 avail 原点。macOS 舞台洞就是 avail，卡片 frame 用这份。
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub fn occupancy_in_avail(&self) -> (i32, i32, u32, u32) {
        let (x, y, w, h) = self.occupancy();
        (x - self.avail_x, y - self.avail_y, w, h)
    }

    /// 有内容尺寸时 contain(avail)。解绑后 dest 是 Fill；DComp 从上一拍 clip 插值到 avail。
    pub fn contain_content(&self) -> Letterbox {
        present_dest(self.avail_w, self.avail_h, self.video_w, self.video_h)
    }

    /// Fit：contain(avail, 内容)，相对 avail 原点。Compose 不得再算一遍。
    pub fn fit(&self) -> Letterbox {
        if self.bound && self.video_w > 0 && self.video_h > 0 {
            self.contain_content()
        } else {
            Letterbox {
                x: 0,
                y: 0,
                width: self.avail_w.max(1),
                height: self.avail_h.max(1),
                nearest: false,
                crop_w: 0,
                crop_h: 0,
            }
        }
    }

    pub fn occupancy_kind(&self) -> OccupancyKind {
        OccupancyKind::of(self.bound, self.video_w, self.video_h)
    }

    pub fn occupancy_motion(&mut self) -> OccupancyMotion {
        let next = self.occupancy_kind();
        let motion = OccupancyMotion::from_kind_change(self.last_occupancy_kind, next);
        self.last_occupancy_kind = Some(next);
        motion
    }

    /// 占用 / Present dest，主窗客户区坐标。Fill=avail；Dest=contain。
    pub fn dest(&self) -> Letterbox {
        let fit = self.fit();
        if self.occupancy_kind() == OccupancyKind::Fill {
            Letterbox {
                x: self.avail_x,
                y: self.avail_y,
                width: self.avail_w.max(1),
                height: self.avail_h.max(1),
                nearest: fit.nearest,
                crop_w: fit.crop_w,
                crop_h: fit.crop_h,
            }
        } else {
            Letterbox {
                x: self.avail_x + fit.x,
                y: self.avail_y + fit.y,
                width: fit.width.max(1),
                height: fit.height.max(1),
                nearest: fit.nearest,
                crop_w: fit.crop_w,
                crop_h: fit.crop_h,
            }
        }
    }

    /// dest 相对 avail 原点。macOS 触控与视频层在 avail 洞内。
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub fn dest_in_avail(&self) -> Letterbox {
        let d = self.dest();
        Letterbox {
            x: d.x - self.avail_x,
            y: d.y - self.avail_y,
            width: d.width,
            height: d.height,
            nearest: d.nearest,
            crop_w: d.crop_w,
            crop_h: d.crop_h,
        }
    }

    pub fn letterbox_argb(&self) -> u32 {
        stage_palette(self.dark()).canvas_argb
    }

    pub fn panel_stroke(&self) -> (f32, u32) {
        if self.fullscreen {
            (0.0, 0)
        } else {
            (stage_stroke_px(self.dpr()), stage_border_argb(self.dark()))
        }
    }

    /// 铬模式的回缓冲规格。`shows_chrome()` 为真则每拍都有，不是 dirty overlay。
    pub fn chrome_draw(&self) -> Option<ChromeDraw> {
        if !self.presentable() || !self.shows_chrome() {
            return None;
        }
        let (title, description) = stage_copy(
            self.mode,
            self.has_device(),
            self.failed(),
            self.error(),
            self.video_w > 0 && self.video_h > 0,
        );
        let pal = stage_palette(self.dark());
        let (icon_px, title_px, body_px) = stage_type_px(self.dpr());
        Some(ChromeDraw {
            mode: self.mode,
            title,
            description,
            canvas_argb: pal.canvas_argb,
            title_argb: pal.title_argb,
            body_argb: pal.body_argb,
            icon_argb: pal.icon_argb,
            well_argb: pal.well_argb,
            icon_px,
            title_px,
            body_px,
        })
    }
}

pub fn stage_mode(paused: bool, bound: bool, has_frame: bool) -> MirrorStageMode {
    if paused && bound && has_frame {
        MirrorStageMode::Paused
    } else if bound && has_frame {
        MirrorStageMode::Video
    } else if bound {
        MirrorStageMode::Loading
    } else {
        MirrorStageMode::Empty
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layout() -> MirrorLayout {
        MirrorLayout {
            serial: "S1".into(),
            x: 10,
            y: 20,
            width: 900,
            height: 950,
            visible: true,
            dpr: 1.0,
            fullscreen: false,
            paused: false,
            control: true,
            has_device: true,
            failed: false,
            error: String::new(),
            dark: true,
        }
    }

    #[test]
    fn chrome_stack_gap_and_block() {
        let s = chrome_stack(40.0, 16.0, 14.0);
        let gap = (16.0_f32 * 0.75).max(crate::tokens::SPACE_SM as f32);
        assert_eq!(s.gap, gap);
        assert_eq!(
            s.block,
            40.0 + gap + s.title_box + s.after_title + s.body_box
        );
        assert_eq!(s.block, 40.0 + gap + 16.0 * 1.4 + gap * 0.35 + 14.0 * 2.6);
        assert_eq!(s.title_inset, crate::tokens::SPACE_LG as f32);
        assert_eq!(s.body_inset, crate::tokens::SPACE_XL as f32);
        assert_eq!(s.title_box, 16.0 * 1.4);
        assert_eq!(s.body_box, 14.0 * 2.6);
        assert_eq!(s.after_title, gap * 0.35);
        assert_eq!(s.row_min, crate::tokens::SPACE_SM as f32);
        assert_eq!(
            chrome_stack(40.0, 8.0, 14.0).gap,
            crate::tokens::SPACE_SM as f32
        );
    }

    #[test]
    fn chrome_fill_uses_panel_surface_not_canvas() {
        let light = stage_palette(false);
        let dark = stage_palette(true);
        assert_eq!(light.canvas_argb, 0xFFFFFFFF);
        assert_eq!(dark.canvas_argb, 0xFF202224);
    }

    #[test]
    fn hwnd_card_uses_border_strong() {
        assert_eq!(stage_border_argb(false), 0x66000000);
        assert_eq!(stage_border_argb(true), 0x66FFFFFF);
    }

    #[test]
    fn light_empty_icon_uses_fg_and_surface_2_well() {
        let light = stage_palette(false);
        assert_eq!(light.icon_argb, light.title_argb);
        assert_eq!(light.well_argb, 0xFFE5E5EA);
        assert_eq!(light.body_argb, 0x99000000);
    }

    #[test]
    fn unbound_occupancy_fills_avail() {
        let mut s = Stage::new("S1".into());
        s.apply_layout(&layout());
        s.set_host_size(800, 600);
        assert!(!s.bound());
        assert_eq!(s.mode(), MirrorStageMode::Empty);
        assert!(s.shows_chrome());
        assert!(!s.control());
        assert_eq!(s.occupancy(), (10, 20, 900, 950));
        assert_eq!(s.occupancy_in_avail(), (0, 0, 900, 950));
        assert_eq!(s.letterbox_argb(), 0xFF202224);
    }

    #[test]
    fn bind_without_frame_is_loading() {
        let mut s = Stage::new("S1".into());
        s.apply_layout(&layout());
        s.bind("S1".into(), 3);
        assert_eq!(s.mode(), MirrorStageMode::Loading);
        assert_eq!(s.generation, 3);
        assert!(!s.control());
    }

    #[test]
    fn bound_video_contain_and_control() {
        let mut s = Stage::new("S1".into());
        s.apply_layout(&layout());
        s.set_host_size(900, 950);
        s.bind("S1".into(), 1);
        assert!(s.set_video_size(1088, 2400));
        s.mark_frame();
        assert_eq!(s.mode(), MirrorStageMode::Video);
        assert!(s.shows_video());
        assert!(s.control());
        let (x, y, w, h) = s.occupancy();
        assert_eq!((x, y, w, h), (244, 20, 431, 950));
        let dest = s.dest();
        assert_eq!((dest.x, dest.y, dest.width, dest.height), (x, y, w, h));
        assert_eq!(s.occupancy_in_avail(), (234, 0, 431, 950));
        assert!(!dest.nearest);
        assert_eq!((dest.width, dest.height), (431, 950));
    }

    #[test]
    fn dest_is_contain_not_integer_third() {
        let mut s = Stage::new("S1".into());
        let mut l = layout();
        l.width = 1008;
        l.height = 991;
        s.apply_layout(&l);
        s.bind("S1".into(), 1);
        s.set_video_size(1220, 2712);
        s.mark_frame();
        let occ = s.occupancy();
        let dest = s.dest();
        assert_eq!(
            (dest.x, dest.y, dest.width, dest.height),
            (occ.0, occ.1, occ.2, occ.3)
        );
        assert_eq!((dest.width, dest.height), (446, 991));
        assert_eq!(dest.x, 10 + (1008 - 446) / 2);
        assert_eq!(dest.y, 20);
        assert_eq!((dest.crop_w, dest.crop_h), (1220, 2712));
        assert!(!dest.nearest);
    }

    #[test]
    fn layout_avail_recenters_dest_in_parent() {
        let mut s = Stage::new("S1".into());
        s.apply_layout(&layout());
        s.bind("S1".into(), 1);
        s.set_video_size(1088, 2400);
        let (x1, y1, w1, h1) = s.occupancy();
        assert_eq!((x1, y1, w1, h1), (244, 20, 431, 950));
        let mut wider = layout();
        wider.x = 10 - 152;
        wider.width = 900 + 152;
        s.apply_layout(&wider);
        s.set_host_size(1200, 1000);
        let (x2, y2, w2, h2) = s.occupancy();
        assert_eq!((y2, h2), (20, 950));
        assert_eq!(w2, w1);
        assert_eq!(x2, -142 + (1052 - w2 as i32) / 2);
        assert_ne!(x2, x1);
        assert_eq!(s.occupancy_in_avail(), ((1052 - w2 as i32) / 2, 0, w2, h2));
    }

    #[test]
    fn occupancy_kind_is_fill_until_content() {
        let mut s = Stage::new("S1".into());
        s.apply_layout(&layout());
        assert_eq!(s.occupancy_kind(), OccupancyKind::Fill);
        s.bind("S1".into(), 1);
        assert_eq!(s.occupancy_kind(), OccupancyKind::Fill);
        s.set_video_size(1088, 2400);
        assert_eq!(s.occupancy_kind(), OccupancyKind::Dest);
    }

    #[test]
    fn occupancy_motion_follows_kind_not_avail() {
        assert_eq!(
            OccupancyMotion::from_kind_change(None, OccupancyKind::Fill),
            OccupancyMotion::Follow
        );
        assert_eq!(
            OccupancyMotion::from_kind_change(Some(OccupancyKind::Fill), OccupancyKind::Dest),
            OccupancyMotion::FillToDest
        );
        assert_eq!(
            OccupancyMotion::from_kind_change(Some(OccupancyKind::Dest), OccupancyKind::Dest),
            OccupancyMotion::Follow
        );
        assert_eq!(
            OccupancyMotion::from_kind_change(Some(OccupancyKind::Dest), OccupancyKind::Fill),
            OccupancyMotion::DestToFill
        );
        let mut s = Stage::new("S1".into());
        s.apply_layout(&layout());
        assert_eq!(s.occupancy_motion(), OccupancyMotion::Follow);
        s.bind("S1".into(), 1);
        assert_eq!(s.occupancy_motion(), OccupancyMotion::Follow);
        s.set_video_size(1088, 2400);
        assert_eq!(s.occupancy_motion(), OccupancyMotion::FillToDest);
        let mut wider = layout();
        wider.width = 1052;
        s.apply_layout(&wider);
        assert_eq!(s.occupancy_motion(), OccupancyMotion::Follow);
        s.unbind();
        assert_eq!(s.occupancy_motion(), OccupancyMotion::DestToFill);
        assert_eq!(OccupancyMotion::Follow.spec(), None);
        assert_eq!(
            OccupancyMotion::FillToDest.spec(),
            Some(MotionSpec::SpatialPanel)
        );
        assert_eq!(
            OccupancyMotion::DestToFill.spec(),
            Some(MotionSpec::SpatialEnter)
        );
        assert!(MotionSpec::SpatialEnter.duration_ms() > MotionSpec::SpatialPanel.duration_ms());
    }

    #[test]
    fn resume_same_beat_is_follow_not_fill_dest() {
        let mut s = Stage::new("S1".into());
        s.apply_layout(&layout());
        s.bind("S1".into(), 1);
        s.set_video_size(1088, 2400);
        s.mark_frame();
        assert_eq!(s.occupancy_kind(), OccupancyKind::Dest);
        assert_eq!(s.occupancy_motion(), OccupancyMotion::Follow);
    }

    #[test]
    fn pause_hides_video_and_control() {
        let mut s = Stage::new("S1".into());
        let mut l = layout();
        l.paused = true;
        s.apply_layout(&l);
        s.bind("S1".into(), 1);
        s.set_video_size(1088, 2400);
        s.mark_frame();
        assert_eq!(s.mode(), MirrorStageMode::Paused);
        assert!(s.shows_chrome());
        assert!(!s.control());
    }

    #[test]
    fn loading_allows_first_picture_then_video() {
        let mut s = Stage::new("S1".into());
        s.apply_layout(&layout());
        s.bind("S1".into(), 1);
        assert!(s.allows_video_present());
        assert!(!s.shows_video());
        s.set_video_size(1088, 2400);
        s.mark_frame();
        assert!(s.shows_video());
        assert!(s.allows_video_present());
    }

    #[test]
    fn unbind_returns_empty_keeps_video_size() {
        let mut s = Stage::new("S1".into());
        s.bind("S1".into(), 1);
        s.set_video_size(1088, 2400);
        s.mark_frame();
        s.unbind();
        assert_eq!(s.mode(), MirrorStageMode::Empty);
        assert!(!s.bound());
        assert_eq!(s.video_size(), (1088, 2400));
    }

    #[test]
    fn chrome_owns_backbuffer_every_tick_while_empty() {
        let mut s = Stage::new("S1".into());
        s.apply_layout(&layout());
        s.set_host_size(900, 950);
        assert!(s.chrome_draw().is_some());
        assert!(s.chrome_draw().is_some());
        s.bind("S1".into(), 1);
        s.set_video_size(1088, 2400);
        s.mark_frame();
        assert!(s.chrome_draw().is_none());
        s.unbind();
        assert!(s.shows_chrome());
        assert!(s.chrome_draw().is_some());
        assert!(s.chrome_draw().is_some());
    }
}
