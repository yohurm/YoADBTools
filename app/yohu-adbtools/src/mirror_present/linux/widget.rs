//! GTK 3 子窗口。只在主线程创建和翻页。解码线程把最后一帧放进槽里再叫醒主循环。

use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use gtk::gdk;
use gtk::glib;
use gtk::glib::translate::{FromGlibPtrNone, ToGlibPtr};
use gtk::prelude::*;
use pangocairo::cairo::{self, Format};
use pango::FontDescription;

use super::super::scale::Letterbox;
use super::super::stage_palette::argb_to_rgba;
use super::vaapi::VaBlit;

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
    pub canvas: u32,
    pub title_argb: u32,
    pub body_argb: u32,
    pub title_px: u32,
    pub body_px: u32,
    pub title: String,
    pub body: String,
    pub chrome: bool,
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
}

struct Canvas {
    generation: u64,
    owner: isize,
    child: Option<gdk::Window>,
    last: Option<PaintJob>,
    shared: Arc<Shared>,
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
    pub canvas: u32,
    pub title_argb: u32,
    pub body_argb: u32,
    pub title_px: u32,
    pub body_px: u32,
    pub title: String,
    pub body: String,
    pub chrome: bool,
}

impl StagePaint {
    pub fn job(self) -> PaintJob {
        PaintJob {
            show: self.show,
            avail_x: self.avail_x,
            avail_y: self.avail_y,
            avail_w: self.avail_w,
            avail_h: self.avail_h,
            canvas: self.canvas,
            title_argb: self.title_argb,
            body_argb: self.body_argb,
            title_px: self.title_px,
            body_px: self.body_px,
            title: self.title,
            body: self.body,
            chrome: self.chrome,
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
        if canvas.shared.job.lock().ok().is_some_and(|job| job.is_some()) &&
            !canvas.shared.scheduled.swap(true, Ordering::AcqRel)
        {
            glib::idle_add_once(redraw);
        }
        canvas.paint();
    });
}

impl Canvas {
    fn paint(&mut self) {
        let Some(job) = self.last.as_mut() else {
            return;
        };
        if !job.show || job.avail_w <= 0 || job.avail_h <= 0 {
            if let Some(child) = self.child.as_ref() {
                child.hide();
            }
            return;
        }
        let Some((parent, scale)) = parent_window(self.owner) else {
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
        if let Some(cr) = frame.cairo_context() {
            fill_rgb(&cr, job.canvas);
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
            if job.chrome {
                draw_copy(&cr, job, w, h);
            }
        }
        child.end_draw_frame(&frame);
    }
}

fn parent_window(owner: isize) -> Option<(gdk::Window, i32)> {
    if owner == 0 {
        return None;
    }
    unsafe {
        let widget: gtk::Widget =
            gtk::Widget::from_glib_none(owner as *mut gtk::ffi::GtkWidget);
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
    (
        x / scale,
        y / scale,
        (w / scale).max(1),
        (h / scale).max(1),
    )
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

fn draw_copy(cr: &cairo::Context, job: &PaintJob, width: i32, height: i32) {
    if job.title.is_empty() && job.body.is_empty() {
        return;
    }
    let layout = pangocairo::create_layout(cr);
    let mut desc = FontDescription::new();
    desc.set_family("WenQuanYi Micro Hei, Droid Sans Fallback, Sans");
    desc.set_absolute_size(job.title_px.max(1) as f64 * f64::from(pango::SCALE));
    layout.set_font_description(Some(&desc));
    layout.set_alignment(pango::Alignment::Center);
    layout.set_width(width.max(1) * pango::SCALE);
    layout.set_text(&job.title);
    let (_, title_h) = layout.pixel_size();
    desc.set_absolute_size(job.body_px.max(1) as f64 * f64::from(pango::SCALE));
    let body_layout = pangocairo::create_layout(cr);
    body_layout.set_font_description(Some(&desc));
    body_layout.set_alignment(pango::Alignment::Center);
    body_layout.set_width(width.max(1) * pango::SCALE);
    body_layout.set_text(&job.body);
    let (_, body_h) = body_layout.pixel_size();
    let gap = 8;
    let block = title_h + gap + body_h;
    let top = ((height - block) / 2).max(0);
    let [r, g, b, a] = argb_to_rgba(job.title_argb);
    cr.set_source_rgba(r as f64, g as f64, b as f64, a as f64);
    cr.move_to(0.0, top as f64);
    pangocairo::show_layout(cr, &layout);
    let [r, g, b, a] = argb_to_rgba(job.body_argb);
    cr.set_source_rgba(r as f64, g as f64, b as f64, a as f64);
    cr.move_to(0.0, (top + title_h + gap) as f64);
    pangocairo::show_layout(cr, &body_layout);
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
