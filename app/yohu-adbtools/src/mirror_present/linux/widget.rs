//! GTK 3 子窗口。只在主线程创建和翻页。解码线程把最后一帧放进槽里再叫醒主循环。
//!
//! 洞仍盖住 avail。可见卡片是占用 dest：卡片外铺窗口 canvas（letterbox），
//! 铬和描边画在卡片上，跟 Windows DComp clip + chrome 同一套几何。

use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use gtk::gdk;
use gtk::glib;
use gtk::glib::translate::{FromGlibPtrNone, ToGlibPtr};
use gtk::prelude::*;
use pango::FontDescription;
use pangocairo::cairo::{self, Format};

use super::super::scale::Letterbox;
use super::super::stage::chrome_stack;
use super::super::stage_palette::argb_to_rgba;
use super::host::CardMotion;
use super::vaapi::VaBlit;
use crate::limits::{PRESENT_SPIN_DELTA, PRESENT_SPIN_STEP};

pub(super) struct VideoPaint {
    bgra: Vec<u8>,
    width: i32,
    height: i32,
    dest: Letterbox,
    blit: Option<VaBlit>,
}

pub struct PaintJob {
    pub show: bool,
    pub avail_x: i32,
    pub avail_y: i32,
    pub avail_w: i32,
    pub avail_h: i32,
    pub card: Letterbox,
    pub radius: f32,
    pub stroke: f32,
    pub border: u32,
    pub canvas: u32,
    pub page: u32,
    pub title_argb: u32,
    pub body_argb: u32,
    pub icon_argb: u32,
    pub well_argb: u32,
    pub icon_px: u32,
    pub title_px: u32,
    pub body_px: u32,
    pub title: String,
    pub body: String,
    pub chrome: bool,
    pub loading: bool,
    pub motion: Option<CardMotion>,
    pub yield_web: bool,
    pub(super) video: Option<VideoPaint>,
}

pub struct Shared {
    job: Mutex<Option<PaintJob>>,
    scheduled: AtomicBool,
    pub xid: Arc<AtomicU64>,
    generation: u64,
}

thread_local! {
    static CANVAS: RefCell<Option<Canvas>> = const { RefCell::new(None) };
    static TIMER: RefCell<bool> = const { RefCell::new(false) };
    static SPIN_ARMED: RefCell<bool> = const { RefCell::new(false) };
    static CARD_ARMED: RefCell<bool> = const { RefCell::new(false) };
}

struct Canvas {
    generation: u64,
    owner: isize,
    child: Option<gdk::Window>,
    last: Option<PaintJob>,
    shared: Arc<Shared>,
    spin: f32,
    spin_at: Instant,
}

pub fn shared(xid: Arc<AtomicU64>) -> Arc<Shared> {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    Arc::new(Shared {
        job: Mutex::new(None),
        scheduled: AtomicBool::new(false),
        xid,
        generation: NEXT.fetch_add(1, Ordering::Relaxed),
    })
}

pub fn boot(owner: isize, shared: Arc<Shared>) {
    let generation = shared.generation;
    glib::idle_add_once(move || {
        install_timer();
        CANVAS.with(|slot| {
            *slot.borrow_mut() = Some(Canvas {
                generation,
                owner,
                child: None,
                last: None,
                shared,
                spin: 0.0,
                spin_at: Instant::now(),
            });
        });
        redraw();
    });
}

pub fn post(shared: &Shared, job: PaintJob) {
    if let Ok(mut slot) = shared.job.lock() {
        *slot = Some(job);
    }
    if shared.scheduled.swap(true, Ordering::AcqRel) {
        return;
    }
    glib::idle_add_once(redraw);
}

pub struct StagePaint {
    pub show: bool,
    pub avail_x: i32,
    pub avail_y: i32,
    pub avail_w: i32,
    pub avail_h: i32,
    pub card: Letterbox,
    pub radius: f32,
    pub stroke: f32,
    pub border: u32,
    pub canvas: u32,
    pub page: u32,
    pub title_argb: u32,
    pub body_argb: u32,
    pub icon_argb: u32,
    pub well_argb: u32,
    pub icon_px: u32,
    pub title_px: u32,
    pub body_px: u32,
    pub title: String,
    pub body: String,
    pub chrome: bool,
    pub loading: bool,
    pub motion: Option<CardMotion>,
    /// 缺 OpenH264 时藏起 GTK 子窗口，让网页上的下载按钮露出来。
    pub yield_web: bool,
}

impl StagePaint {
    pub fn job(self) -> PaintJob {
        PaintJob {
            show: self.show,
            avail_x: self.avail_x,
            avail_y: self.avail_y,
            avail_w: self.avail_w,
            avail_h: self.avail_h,
            card: self.card,
            radius: self.radius,
            stroke: self.stroke,
            border: self.border,
            canvas: self.canvas,
            page: self.page,
            title_argb: self.title_argb,
            body_argb: self.body_argb,
            icon_argb: self.icon_argb,
            well_argb: self.well_argb,
            icon_px: self.icon_px,
            title_px: self.title_px,
            body_px: self.body_px,
            title: self.title,
            body: self.body,
            chrome: self.chrome,
            loading: self.loading,
            motion: self.motion,
            yield_web: self.yield_web,
            video: None,
        }
    }

    pub fn with_video(
        self,
        bgra: Vec<u8>,
        width: i32,
        height: i32,
        dest: Letterbox,
        blit: Option<VaBlit>,
    ) -> PaintJob {
        let mut job = self.job();
        job.video = Some(VideoPaint {
            bgra,
            width,
            height,
            dest,
            blit,
        });
        job
    }
}

fn install_timer() {
    TIMER.with(|flag| {
        if *flag.borrow() {
            return;
        }
        *flag.borrow_mut() = true;
        glib::timeout_add_local(Duration::from_millis(200), || {
            redraw();
            glib::ControlFlow::Continue
        });
    });
}

fn redraw() {
    CANVAS.with(|slot| {
        let mut guard = slot.borrow_mut();
        let Some(canvas) = guard.as_mut() else {
            return;
        };
        canvas.shared.scheduled.store(false, Ordering::Release);
        if let Ok(mut job) = canvas.shared.job.lock() {
            if let Some(next) = job.take() {
                canvas.last = Some(next);
            }
        }
        if canvas
            .shared
            .job
            .lock()
            .ok()
            .is_some_and(|job| job.is_some())
            && !canvas.shared.scheduled.swap(true, Ordering::AcqRel)
        {
            glib::idle_add_once(redraw);
        }
        canvas.paint();
    });
}

impl Canvas {
    fn paint(&mut self) {
        let visible = self
            .last
            .as_ref()
            .is_some_and(|job| job.show && job.avail_w > 0 && job.avail_h > 0);
        if !visible {
            if let Some(child) = self.child.as_ref() {
                child.hide();
            }
            return;
        }
        let yield_web = self.last.as_ref().is_some_and(|job| job.yield_web);
        if yield_web {
            if let Some(child) = self.child.as_ref() {
                child.hide();
            }
            return;
        }
        let loading = self
            .last
            .as_ref()
            .is_some_and(|job| job.loading && job.chrome);
        let spin = self.advance_spin(loading);
        let owner = self.owner;
        let Some(job) = self.last.as_mut() else {
            return;
        };
        let Some((parent, scale)) = parent_window(owner) else {
            return;
        };
        let (x, y, w, h) = logical_rect(job.avail_x, job.avail_y, job.avail_w, job.avail_h, scale);
        if self.child.is_none() {
            self.child = Some(make_child(&parent, x, y, w, h));
            if let Some(child) = self.child.as_ref() {
                let xid = window_xid(child);
                self.shared.xid.store(xid, Ordering::SeqCst);
                tracing::info!(xid, x, y, w, h, "投屏 GTK 子窗口已盖住洞");
            }
        }
        let Some(child) = self.child.as_ref() else {
            return;
        };
        child.move_resize(x, y, w, h);
        child.show();
        child.raise();
        let region = cairo::Region::create_rectangle(&cairo::RectangleInt::new(0, 0, w, h));
        let Some(frame) = child.begin_draw_frame(&region) else {
            return;
        };
        let card = CardPx::from(logical_box(visual_card(job), scale));
        if job.motion.as_ref().is_some_and(CardMotion::running) && gtk_motion_allowed() {
            arm_card();
        }
        let unit = scale.max(1) as f64;
        let radius = f64::from(job.radius) / unit;
        let stroke = f64::from(job.stroke) / unit;
        if let Some(cr) = frame.cairo_context() {
            fill_rgb(&cr, job.page);
            cr.save().ok();
            clip_round(&cr, &card, radius);
            if job.chrome {
                fill_rgb(&cr, job.canvas);
                draw_chrome(&cr, job, &card, scale, spin);
            }
            let mut used_put = false;
            if let Some(video) = job.video.as_mut() {
                let dest = logical_box(video.dest, scale);
                if let Some(blit) = video.blit.take() {
                    let xid = self.shared.xid.load(Ordering::SeqCst);
                    used_put = blit.put_into(xid, dest.x, dest.y, dest.width, dest.height);
                }
                if !used_put {
                    blit_bgra(&cr, &video.bgra, video.width, video.height, dest);
                }
            }
            cr.restore().ok();
            stroke_frame(&cr, &card, radius, stroke, job.border);
        }
        child.end_draw_frame(&frame);
    }

    fn advance_spin(&mut self, loading: bool) -> f32 {
        if !loading {
            return self.spin;
        }
        let elapsed = self.spin_at.elapsed();
        if elapsed >= PRESENT_SPIN_STEP {
            let steps = (elapsed.as_secs_f32() / PRESENT_SPIN_STEP.as_secs_f32())
                .floor()
                .max(1.0);
            let turn = std::f32::consts::PI * 2.0;
            self.spin = (self.spin + PRESENT_SPIN_DELTA * steps) % turn;
            self.spin_at = Instant::now();
        }
        arm_spin();
        self.spin
    }
}

fn parent_window(owner: isize) -> Option<(gdk::Window, i32)> {
    if owner == 0 {
        return None;
    }
    unsafe {
        let widget: gtk::Widget = gtk::Widget::from_glib_none(owner as *mut gtk::ffi::GtkWidget);
        let scale = widget.scale_factor().max(1);
        Some((widget.window()?, scale))
    }
}

fn make_child(parent: &gdk::Window, x: i32, y: i32, w: i32, h: i32) -> gdk::Window {
    let attr = gdk::WindowAttr {
        window_type: gdk::WindowType::Child,
        event_mask: gdk::EventMask::EXPOSURE_MASK,
        x: Some(x),
        y: Some(y),
        width: w.max(1),
        height: h.max(1),
        ..gdk::WindowAttr::default()
    };
    let child = gdk::Window::new(Some(parent), &attr);
    child.set_pass_through(true);
    let empty = cairo::Region::create();
    child.input_shape_combine_region(&empty, 0, 0);
    child
}

fn logical_rect(x: i32, y: i32, w: i32, h: i32, scale: i32) -> (i32, i32, i32, i32) {
    let scale = scale.max(1);
    (x / scale, y / scale, (w / scale).max(1), (h / scale).max(1))
}

fn logical_box(dest: Letterbox, scale: i32) -> Letterbox {
    let scale = scale.max(1);
    Letterbox {
        x: dest.x / scale,
        y: dest.y / scale,
        width: (dest.width / scale as u32).max(1),
        height: (dest.height / scale as u32).max(1),
        nearest: dest.nearest,
        crop_w: dest.crop_w,
        crop_h: dest.crop_h,
    }
}

fn fill_rgb(cr: &cairo::Context, argb: u32) {
    let [r, g, b, a] = argb_to_rgba(argb);
    cr.set_source_rgba(r as f64, g as f64, b as f64, a as f64);
    let _ = cr.paint();
}

fn blit_bgra(cr: &cairo::Context, bgra: &[u8], width: i32, height: i32, dest: Letterbox) {
    if width <= 0 || height <= 0 || dest.width == 0 || dest.height == 0 {
        return;
    }
    let Ok(mut image) = cairo::ImageSurface::create(Format::ARgb32, width, height) else {
        return;
    };
    let stride = image.stride() as usize;
    if let Ok(mut data) = image.data() {
        let row = width as usize * 4;
        for y in 0..height as usize {
            let src = y * row;
            let dst = y * stride;
            if src + row <= bgra.len() && dst + row <= data.len() {
                data[dst..dst + row].copy_from_slice(&bgra[src..src + row]);
            }
        }
    }
    cr.save().ok();
    cr.translate(dest.x as f64, dest.y as f64);
    cr.scale(
        dest.width as f64 / width as f64,
        dest.height as f64 / height as f64,
    );
    let _ = cr.set_source_surface(&image, 0.0, 0.0);
    let _ = cr.paint();
    cr.restore().ok();
}

fn visual_card(job: &PaintJob) -> Letterbox {
    let Some(motion) = &job.motion else {
        return job.card;
    };
    if gtk_motion_allowed() && motion.running() {
        motion.sample()
    } else {
        motion.to
    }
}

fn gtk_motion_allowed() -> bool {
    gtk::Settings::default()
        .map(|settings| settings.is_gtk_enable_animations())
        .unwrap_or(true)
}

fn arm_card() {
    CARD_ARMED.with(|flag| {
        if *flag.borrow() {
            return;
        }
        *flag.borrow_mut() = true;
        glib::timeout_add_local(PRESENT_SPIN_STEP, || {
            CARD_ARMED.with(|flag| *flag.borrow_mut() = false);
            redraw();
            glib::ControlFlow::Break
        });
    });
}

fn arm_spin() {
    SPIN_ARMED.with(|flag| {
        if *flag.borrow() {
            return;
        }
        *flag.borrow_mut() = true;
        glib::timeout_add_local(PRESENT_SPIN_STEP, || {
            SPIN_ARMED.with(|flag| *flag.borrow_mut() = false);
            redraw();
            glib::ControlFlow::Break
        });
    });
}

struct CardPx {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

impl From<Letterbox> for CardPx {
    fn from(box_: Letterbox) -> Self {
        Self {
            x: f64::from(box_.x),
            y: f64::from(box_.y),
            w: f64::from(box_.width),
            h: f64::from(box_.height),
        }
    }
}

fn clip_round(cr: &cairo::Context, card: &CardPx, radius: f64) {
    trace_round(cr, card.x, card.y, card.w, card.h, radius);
    cr.clip();
}

fn trace_round(cr: &cairo::Context, x: f64, y: f64, w: f64, h: f64, radius: f64) {
    let r = radius.max(0.0).min(w * 0.5).min(h * 0.5);
    if r <= 0.0 {
        cr.rectangle(x, y, w, h);
        return;
    }
    let pi = std::f64::consts::PI;
    cr.new_sub_path();
    cr.arc(x + w - r, y + r, r, -pi / 2.0, 0.0);
    cr.arc(x + w - r, y + h - r, r, 0.0, pi / 2.0);
    cr.arc(x + r, y + h - r, r, pi / 2.0, pi);
    cr.arc(x + r, y + r, r, pi, pi * 1.5);
    cr.close_path();
}

fn stroke_frame(cr: &cairo::Context, card: &CardPx, radius: f64, stroke: f64, border: u32) {
    if stroke <= 0.0 || border == 0 {
        return;
    }
    let inset = stroke.max(1.0);
    let x = card.x + inset;
    let y = card.y + inset;
    let w = (card.w - inset * 2.0).max(1.0);
    let h = (card.h - inset * 2.0).max(1.0);
    let corner = (radius - inset).max(0.0);
    set_argb(cr, border);
    cr.set_line_width(stroke);
    cr.set_line_cap(cairo::LineCap::Round);
    cr.set_line_join(cairo::LineJoin::Round);
    trace_round(cr, x, y, w, h, corner);
    let _ = cr.stroke();
}

fn draw_chrome(cr: &cairo::Context, job: &PaintJob, card: &CardPx, scale: i32, spin: f32) {
    let unit = scale.max(1) as f64;
    let icon = f64::from(job.icon_px) / unit;
    let title_px = f64::from(job.title_px) / unit;
    let body_px = f64::from(job.body_px) / unit;
    let stack = chrome_stack(job.icon_px as f32, job.title_px as f32, job.body_px as f32);
    let gap = f64::from(stack.gap) / unit;
    let block = f64::from(stack.block) / unit;
    let title_inset = f64::from(stack.title_inset) / unit;
    let body_inset = f64::from(stack.body_inset) / unit;
    let title_box = f64::from(stack.title_box) / unit;
    let after_title = f64::from(stack.after_title) / unit;
    let mut y = card.y + ((card.h - block) * 0.5).max(0.0);
    let cx = card.x + card.w * 0.5;
    draw_icon_well(cr, cx, y + icon * 0.5, icon * 0.56, job.well_argb);
    if job.loading {
        draw_spinner(
            cr,
            cx,
            y + icon * 0.5,
            icon * 0.42,
            spin,
            job.icon_argb,
            job.body_argb,
        );
    } else {
        draw_mirror_icon(cr, cx, y, icon, job.icon_argb);
    }
    y += icon + gap;
    draw_label(
        cr,
        &job.title,
        LabelBox {
            px: title_px,
            medium: true,
            argb: job.title_argb,
            x: card.x + title_inset,
            y,
            width: (card.w - title_inset * 2.0).max(1.0),
        },
    );
    y += title_box + after_title;
    draw_label(
        cr,
        &job.body,
        LabelBox {
            px: body_px,
            medium: false,
            argb: job.body_argb,
            x: card.x + body_inset,
            y,
            width: (card.w - body_inset * 2.0).max(1.0),
        },
    );
}

struct LabelBox {
    px: f64,
    medium: bool,
    argb: u32,
    x: f64,
    y: f64,
    width: f64,
}

fn draw_label(cr: &cairo::Context, text: &str, label: LabelBox) {
    let layout = pangocairo::create_layout(cr);
    let mut desc = FontDescription::new();
    desc.set_family("WenQuanYi Micro Hei, Droid Sans Fallback, Sans");
    desc.set_weight(if label.medium {
        pango::Weight::Medium
    } else {
        pango::Weight::Normal
    });
    desc.set_absolute_size(label.px.max(1.0) * f64::from(pango::SCALE));
    layout.set_font_description(Some(&desc));
    layout.set_alignment(pango::Alignment::Center);
    layout.set_width((label.width.round() as i32).max(1) * pango::SCALE);
    layout.set_text(text);
    set_argb(cr, label.argb);
    cr.move_to(label.x, label.y);
    pangocairo::show_layout(cr, &layout);
}

fn draw_icon_well(cr: &cairo::Context, cx: f64, cy: f64, radius: f64, argb: u32) {
    if radius <= 0.0 {
        return;
    }
    set_argb(cr, argb);
    cr.arc(cx, cy, radius, 0.0, std::f64::consts::PI * 2.0);
    let _ = cr.fill();
}

fn draw_mirror_icon(cr: &cairo::Context, cx: f64, top: f64, size: f64, argb: u32) {
    if size <= 0.0 {
        return;
    }
    let stroke = (size / 10.0).clamp(2.0, 3.5);
    let s = size / 24.0;
    let ox = cx - size * 0.5;
    set_argb(cr, argb);
    cr.set_line_width(stroke);
    cr.set_line_cap(cairo::LineCap::Round);
    cr.set_line_join(cairo::LineJoin::Round);
    trace_round(cr, ox + 2.0 * s, top + 2.0 * s, 11.0 * s, 13.0 * s, 2.0 * s);
    let _ = cr.stroke();
    trace_round(cr, ox + 9.0 * s, top + 9.0 * s, 13.0 * s, 13.0 * s, 2.0 * s);
    let _ = cr.stroke();
}

fn draw_spinner(
    cr: &cairo::Context,
    cx: f64,
    cy: f64,
    radius: f64,
    spin: f32,
    accent: u32,
    track: u32,
) {
    if radius <= 0.0 {
        return;
    }
    let stroke = (radius / 6.0).clamp(2.0, 4.0);
    cr.set_line_width(stroke);
    cr.set_line_cap(cairo::LineCap::Round);
    set_argb(cr, track);
    cr.arc(cx, cy, radius, 0.0, std::f64::consts::PI * 2.0);
    let _ = cr.stroke();
    let spin = f64::from(spin);
    set_argb(cr, accent);
    cr.arc(
        cx + radius * spin.cos(),
        cy + radius * spin.sin(),
        stroke * 1.1,
        0.0,
        std::f64::consts::PI * 2.0,
    );
    let _ = cr.fill();
}

fn set_argb(cr: &cairo::Context, argb: u32) {
    let [r, g, b, a] = argb_to_rgba(argb);
    cr.set_source_rgba(r as f64, g as f64, b as f64, a as f64);
}

fn window_xid(window: &gdk::Window) -> u64 {
    unsafe {
        let sym = libc::dlsym(libc::RTLD_DEFAULT, c"gdk_x11_window_get_xid".as_ptr());
        if sym.is_null() {
            return 0;
        }
        let get: unsafe extern "C" fn(*mut libc::c_void) -> u64 = std::mem::transmute(sym);
        let raw = ToGlibPtr::<*mut gtk::gdk::ffi::GdkWindow>::to_glib_none(window);
        get(raw.0 as *mut libc::c_void)
    }
}
