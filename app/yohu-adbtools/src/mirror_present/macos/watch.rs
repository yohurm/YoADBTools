//! 指针监视：NSEvent local monitor → Host 触控。不碰 NSView 树布局。

use std::ptr::NonNull;
use std::sync::Arc;

use block2::RcBlock;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventType};

use super::host::{touch_down, touch_move, touch_up};
use super::view::{Views, VIEWS};

impl Views {
    pub(super) fn install_monitor(&mut self) {
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
