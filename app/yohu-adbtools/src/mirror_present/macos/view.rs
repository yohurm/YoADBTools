//! NSView 舞台：铺满 avail；卡片 occupancy + 圆角；画面在 dest。

use std::cell::RefCell;
use std::ptr::NonNull;
use std::sync::{Arc, Mutex};

use block2::RcBlock;
use dispatch2::DispatchQueue;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSColor, NSEvent, NSEventMask, NSEventType, NSFont, NSProgressIndicator,
    NSProgressIndicatorStyle, NSTextAlignment, NSTextField, NSView, NSWindowOrderingMode,
};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
use objc2_quartz_core::{kCAGravityResize, CATransaction};

use super::super::stage::{argb_to_rgba, stage_copy, stage_palette, stage_type_px};
use super::host::{touch_down, touch_move, touch_up, Host};
use super::vt::ImageRef;
use yohu_protocol::MirrorLayout;

thread_local! {
    static VIEWS: RefCell<Option<Views>> = const { RefCell::new(None) };
}

struct Views {
    root: Retained<NSView>,
    card: Retained<NSView>,
    video: Retained<NSView>,
    spin: Retained<NSProgressIndicator>,
    title: Retained<NSTextField>,
    body: Retained<NSTextField>,
    monitor: Option<Retained<AnyObject>>,
    host: Arc<Mutex<Host>>,
}

pub struct LayoutSnap {
    pub layout: MirrorLayout,
    pub host_h: u32,
    pub occ: (i32, i32, u32, u32),
    pub dest: super::super::scale::Letterbox,
    pub radius: f32,
    pub stroke: f32,
    pub border: u32,
    pub canvas: u32,
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

fn on_main(f: impl FnOnce() + Send) {
    if MainThreadMarker::new().is_some() {
        f();
    } else {
        DispatchQueue::main().exec_sync(f);
    }
}

fn on_main_async(f: impl FnOnce() + Send + 'static) {
    if MainThreadMarker::new().is_some() {
        f();
    } else {
        DispatchQueue::main().exec_async(f);
    }
}

fn ns_rect(x: f64, y: f64, w: f64, h: f64) -> NSRect {
    NSRect {
        origin: NSPoint { x, y },
        size: NSSize {
            width: w.max(1.0),
            height: h.max(1.0),
        },
    }
}

fn color_argb(c: u32) -> Retained<NSColor> {
    let [r, g, b, a] = argb_to_rgba(c);
    NSColor::colorWithRed_green_blue_alpha(r as f64, g as f64, b as f64, a as f64)
}

fn from_owner(owner: isize) -> Option<Retained<NSView>> {
    if owner == 0 {
        return None;
    }
    unsafe { Retained::retain(owner as *mut NSView) }
}

fn pt_rect(x: i32, y: i32, w: u32, h: u32, host_h: u32, dpr: f64) -> NSRect {
    let x_pt = x as f64 / dpr;
    let y_pt = y as f64 / dpr;
    let w_pt = w as f64 / dpr;
    let h_pt = h as f64 / dpr;
    let host_pt = host_h as f64 / dpr;
    ns_rect(x_pt, host_pt - y_pt - h_pt, w_pt, h_pt)
}

impl Host {
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
        let (canvas, _, _) = stage_palette(self.stage.dark());
        let (stroke, border) = self.stage.panel_stroke();
        LayoutSnap {
            layout: MirrorLayout {
                serial: self.stage.serial.clone(),
                x: self.stage.avail().0,
                y: self.stage.avail().1,
                width: self.stage.avail().2,
                height: self.stage.avail().3,
                visible: self.stage.visible(),
                dpr: self.stage.dpr(),
                fullscreen: false,
                paused: false,
                control: self.stage.control(),
                has_device: self.stage.has_device(),
                failed: self.stage.failed(),
                error: self.stage.error().to_string(),
                dark: self.stage.dark(),
            },
            host_h,
            occ: self.stage.occupancy(),
            dest: self.stage.dest(),
            radius: self.stage.corner_radius() as f32,
            stroke,
            border,
            canvas,
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
}

pub fn attach(owner: isize, host: Arc<Mutex<Host>>) {
    on_main(move || {
        let Some(mtm) = MainThreadMarker::new() else {
            tracing::error!("投屏表面必须在主线程创建 NSView");
            return;
        };
        let Some(web) = from_owner(owner) else {
            tracing::error!("投屏表面无法取得 WKWebView");
            return;
        };
        let Some(parent) = (unsafe { web.superview() }) else {
            tracing::error!("投屏表面 WKWebView 没有 superview");
            return;
        };
        let root = NSView::initWithFrame(mtm.alloc(), ns_rect(0.0, 0.0, 64.0, 64.0));
        root.setWantsLayer(true);
        let card = NSView::initWithFrame(mtm.alloc(), ns_rect(0.0, 0.0, 64.0, 64.0));
        card.setWantsLayer(true);
        let video = NSView::initWithFrame(mtm.alloc(), ns_rect(0.0, 0.0, 64.0, 64.0));
        video.setWantsLayer(true);
        if let Some(layer) = video.layer() {
            unsafe { layer.setContentsGravity(kCAGravityResize) };
            layer.setMasksToBounds(true);
        }
        video.setHidden(true);
        let spin = NSProgressIndicator::initWithFrame(mtm.alloc(), ns_rect(0.0, 0.0, 32.0, 32.0));
        spin.setStyle(NSProgressIndicatorStyle::Spinning);
        spin.setDisplayedWhenStopped(false);
        spin.setHidden(true);
        let title = NSTextField::labelWithString(&NSString::from_str(""), mtm);
        title.setAlignment(NSTextAlignment::Center);
        let body = NSTextField::wrappingLabelWithString(&NSString::from_str(""), mtm);
        body.setAlignment(NSTextAlignment::Center);
        root.addSubview(&card);
        card.addSubview(&video);
        card.addSubview(&spin);
        card.addSubview(&title);
        card.addSubview(&body);
        parent.addSubview_positioned_relativeTo(&root, NSWindowOrderingMode::Above, Some(&web));
        let mut views = Views {
            root,
            card,
            video,
            spin,
            title,
            body,
            monitor: None,
            host,
        };
        views.install_monitor();
        VIEWS.with(|slot| *slot.borrow_mut() = Some(views));
    });
}

pub fn detach() {
    on_main(|| {
        VIEWS.with(|slot| {
            if let Some(views) = slot.borrow_mut().take() {
                if let Some(mon) = views.monitor.as_ref() {
                    unsafe { NSEvent::removeMonitor(mon) };
                }
                views.root.removeFromSuperview();
            }
        });
    });
}

pub fn apply_snap(snap: LayoutSnap) {
    on_main(move || {
        VIEWS.with(|slot| {
            let mut slot = slot.borrow_mut();
            let Some(views) = slot.as_mut() else {
                return;
            };
            let dpr = if snap.layout.dpr > 0.0 {
                snap.layout.dpr as f64
            } else {
                1.0
            };
            if let Some(parent) = unsafe { views.root.superview() } {
                let pf = parent.frame();
                let x_pt = snap.layout.x as f64 / dpr;
                let y_pt = snap.layout.y as f64 / dpr;
                let w_pt = snap.layout.width as f64 / dpr;
                let h_pt = snap.layout.height as f64 / dpr;
                views.root.setFrame(ns_rect(
                    pf.origin.x + x_pt,
                    pf.origin.y + pf.size.height - y_pt - h_pt,
                    w_pt,
                    h_pt,
                ));
            }
            if let Some(layer) = views.root.layer() {
                layer.setBackgroundColor(Some(&color_argb(snap.canvas).CGColor()));
            }
            let (ox, oy, ow, oh) = snap.occ;
            views
                .card
                .setFrame(pt_rect(ox, oy, ow, oh, snap.host_h, dpr));
            if let Some(layer) = views.card.layer() {
                layer.setCornerRadius(f64::from(snap.radius) / dpr);
                layer.setMasksToBounds(true);
                layer.setBackgroundColor(Some(&color_argb(snap.canvas).CGColor()));
                layer.setBorderWidth((f64::from(snap.stroke) / dpr).max(0.5));
                layer.setBorderColor(Some(&color_argb(snap.border).CGColor()));
            }
            views.video.setFrame(pt_rect(
                snap.dest.x - ox,
                snap.dest.y - oy,
                snap.dest.width,
                snap.dest.height,
                oh,
                dpr,
            ));
            if let Some(layer) = views.video.layer() {
                if let Some(window) = views.root.window() {
                    layer.setContentsScale(window.backingScaleFactor());
                }
            }
            views.video.setHidden(!snap.video);
            views.title.setHidden(!snap.chrome);
            views.body.setHidden(!snap.chrome);
            views.spin.setHidden(!snap.loading);
            if snap.loading {
                unsafe { views.spin.startAnimation(None) };
            } else {
                unsafe { views.spin.stopAnimation(None) };
            }
            if snap.chrome {
                let (_, title_c, body_c) = stage_palette(snap.dark);
                let card_h = oh as f64 / dpr;
                let card_w = ow as f64 / dpr;
                let icon_pt = f64::from(snap.icon_px) / dpr;
                let title_pt = f64::from(snap.title_px) / dpr;
                let body_pt = f64::from(snap.body_px) / dpr;
                let gap = (title_pt * 0.75).max(8.0);
                let block = icon_pt + gap + title_pt + gap * 0.5 + body_pt;
                let mut y = ((card_h - block) * 0.5).max(0.0);
                views.spin.setFrame(ns_rect(
                    (card_w - icon_pt).max(0.0) * 0.5,
                    card_h - y - icon_pt,
                    icon_pt,
                    icon_pt,
                ));
                y += icon_pt + gap;
                views.title.setStringValue(&NSString::from_str(snap.title));
                views.title.setTextColor(Some(&color_argb(title_c)));
                views
                    .title
                    .setFont(Some(&NSFont::systemFontOfSize(title_pt)));
                views.title.setFrame(ns_rect(
                    16.0,
                    card_h - y - title_pt * 1.4,
                    (card_w - 32.0).max(8.0),
                    title_pt * 1.4,
                ));
                y += title_pt * 1.4 + gap * 0.35;
                views
                    .body
                    .setStringValue(&NSString::from_str(&snap.description));
                views.body.setTextColor(Some(&color_argb(body_c)));
                views.body.setFont(Some(&NSFont::systemFontOfSize(body_pt)));
                views.body.setFrame(ns_rect(
                    24.0,
                    (card_h - y - body_pt * 2.6).max(8.0),
                    (card_w - 48.0).max(8.0),
                    body_pt * 2.6,
                ));
            }
        });
    });
}

pub fn present_pixel(image: ImageRef) {
    on_main_async(move || {
        VIEWS.with(|slot| {
            let mut slot = slot.borrow_mut();
            let Some(views) = slot.as_mut() else {
                return;
            };
            let Some(layer) = views.video.layer() else {
                return;
            };
            let ptr = image.as_ptr() as *mut AnyObject;
            if ptr.is_null() {
                return;
            }
            CATransaction::begin();
            CATransaction::setDisableActions(true);
            unsafe { layer.setContents(Some(&*ptr)) };
            CATransaction::commit();
            views.video.setHidden(false);
        });
    });
}

impl Views {
    fn install_monitor(&mut self) {
        let host = Arc::clone(&self.host);
        let mask = NSEventMask::from_type(NSEventType::LeftMouseDown)
            | NSEventMask::from_type(NSEventType::LeftMouseUp)
            | NSEventMask::from_type(NSEventType::LeftMouseDragged)
            | NSEventMask::from_type(NSEventType::RightMouseDown)
            | NSEventMask::from_type(NSEventType::RightMouseUp)
            | NSEventMask::from_type(NSEventType::RightMouseDragged);
        let block = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
            let event = unsafe { event.as_ref() };
            let pass = event as *const NSEvent as *mut NSEvent;
            VIEWS.with(|slot| {
                let slot = slot.borrow();
                let Some(views) = slot.as_ref() else {
                    return;
                };
                let loc = views
                    .root
                    .convertPoint_fromView(event.locationInWindow(), None);
                let bounds = views.root.bounds();
                if loc.x < 0.0
                    || loc.y < 0.0
                    || loc.x > bounds.size.width
                    || loc.y > bounds.size.height
                {
                    if let Ok(mut h) = host.lock() {
                        h.handle_leave();
                    }
                    return;
                }
                if let Ok(mut h) = host.lock() {
                    let dpr = f64::from(h.stage.dpr().max(0.1));
                    let x = (loc.x * dpr).round() as i32;
                    let y = ((bounds.size.height - loc.y) * dpr).round() as i32;
                    let action = match event.r#type() {
                        NSEventType::LeftMouseDown | NSEventType::RightMouseDown => touch_down(),
                        NSEventType::LeftMouseUp | NSEventType::RightMouseUp => touch_up(),
                        _ => touch_move(),
                    };
                    h.handle_pointer(action, x, y);
                }
            });
            pass
        });
        self.monitor =
            unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(mask, &block) };
    }
}
