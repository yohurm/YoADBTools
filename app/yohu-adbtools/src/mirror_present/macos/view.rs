//! NSView 舞台：铺满 avail；卡片 occupancy + 圆角；画面在 dest。

use std::cell::RefCell;
use std::sync::{Arc, Mutex};

use dispatch2::DispatchQueue;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSColor, NSEvent, NSFont, NSProgressIndicator, NSProgressIndicatorStyle, NSTextAlignment,
    NSTextField, NSView, NSWindowOrderingMode,
};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
use objc2_quartz_core::{kCAGravityResize, CATransaction};

use super::scale::{apply_default_kernel, apply_layer_kernel};

use yohu_protocol::MIRROR_MIN_LAYOUT_PX;

use super::super::stage::{argb_to_rgba, chrome_stack};
use super::host::{Host, LayoutSnap};
use super::vt::ImageRef;

thread_local! {
    pub(super) static VIEWS: RefCell<Option<Views>> = const { RefCell::new(None) };
}

pub(super) struct Views {
    pub(super) root: Retained<NSView>,
    card: Retained<NSView>,
    video: Retained<NSView>,
    spin: Retained<NSProgressIndicator>,
    title: Retained<NSTextField>,
    body: Retained<NSTextField>,
    pub(super) monitor: Option<Retained<AnyObject>>,
    pub(super) host: Arc<Mutex<Host>>,
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
        let min = MIRROR_MIN_LAYOUT_PX as f64;
        let root = NSView::initWithFrame(mtm.alloc(), ns_rect(0.0, 0.0, min, min));
        root.setWantsLayer(true);
        let card = NSView::initWithFrame(mtm.alloc(), ns_rect(0.0, 0.0, min, min));
        card.setWantsLayer(true);
        let video = NSView::initWithFrame(mtm.alloc(), ns_rect(0.0, 0.0, min, min));
        video.setWantsLayer(true);
        if let Some(layer) = video.layer() {
            unsafe { layer.setContentsGravity(kCAGravityResize) };
            apply_default_kernel(&layer);
            layer.setMasksToBounds(true);
        }
        video.setHidden(true);
        let icon = f64::from(crate::tokens::ICON_SM);
        let spin = NSProgressIndicator::initWithFrame(mtm.alloc(), ns_rect(0.0, 0.0, icon, icon));
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
            let dpr = if snap.dpr > 0.0 { snap.dpr as f64 } else { 1.0 };
            if let Some(parent) = unsafe { views.root.superview() } {
                let pf = parent.frame();
                let x_pt = snap.avail_x as f64 / dpr;
                let y_pt = snap.avail_y as f64 / dpr;
                let w_pt = snap.avail_w as f64 / dpr;
                let h_pt = snap.avail_h as f64 / dpr;
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
                apply_layer_kernel(&layer, snap.content_w, snap.content_h, snap.dest);
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
                let title_c = snap.title_argb;
                let body_c = snap.body_argb;
                let card_h = oh as f64 / dpr;
                let card_w = ow as f64 / dpr;
                let icon_pt = f64::from(snap.icon_px) / dpr;
                let title_pt = f64::from(snap.title_px) / dpr;
                let body_pt = f64::from(snap.body_px) / dpr;
                let stack = chrome_stack(icon_pt as f32, title_pt as f32, body_pt as f32);
                let gap = f64::from(stack.gap);
                let block = f64::from(stack.block);
                let title_inset = f64::from(stack.title_inset);
                let body_inset = f64::from(stack.body_inset);
                let title_box = f64::from(stack.title_box);
                let body_box = f64::from(stack.body_box);
                let after_title = f64::from(stack.after_title);
                let row_min = f64::from(stack.row_min);
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
                    title_inset,
                    card_h - y - title_box,
                    (card_w - title_inset * 2.0).max(row_min),
                    title_box,
                ));
                y += title_box + after_title;
                views
                    .body
                    .setStringValue(&NSString::from_str(&snap.description));
                views.body.setTextColor(Some(&color_argb(body_c)));
                views.body.setFont(Some(&NSFont::systemFontOfSize(body_pt)));
                views.body.setFrame(ns_rect(
                    body_inset,
                    (card_h - y - body_box).max(row_min),
                    (card_w - body_inset * 2.0).max(row_min),
                    body_box,
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
