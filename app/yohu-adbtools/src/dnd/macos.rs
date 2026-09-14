//! Finder 拖出：先 pull 到会话目录，再 NSDraggingSession（Copy）。

use std::path::PathBuf;

use objc2::rc::Retained;
use objc2::runtime::{NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{define_class, msg_send, AnyThread, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSApplication, NSDragOperation, NSDraggingContext, NSDraggingItem, NSDraggingSession,
    NSDraggingSource,
};
use objc2_foundation::{NSArray, NSPoint, NSRect, NSSize, NSString, NSURL};
use yohu_files::FileError;

use super::DndError;

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "YohuFileDragSource"]
    struct FileDragSource;

    unsafe impl NSObjectProtocol for FileDragSource {}

    unsafe impl NSDraggingSource for FileDragSource {
        #[allow(non_snake_case)]
        #[unsafe(method(draggingSession:sourceOperationMaskForDraggingContext:))]
        fn draggingSession_sourceOperationMaskForDraggingContext(
            &self,
            _session: &NSDraggingSession,
            _context: NSDraggingContext,
        ) -> NSDragOperation {
            NSDragOperation::Copy
        }
    }
);

impl FileDragSource {
    fn new(mtm: MainThreadMarker) -> Retained<Self> {
        unsafe { msg_send![Self::alloc(mtm), init] }
    }
}

pub fn begin_file_drag(paths: &[PathBuf]) -> Result<(), DndError> {
    let mtm = MainThreadMarker::new().ok_or(DndError::NeedMainThread)?;
    if paths.is_empty() {
        return Err(FileError::EmptyTree(String::new()).into());
    }
    let app = NSApplication::sharedApplication(mtm);
    let event = app.currentEvent().ok_or(DndError::NoGesture)?;
    let window = app.keyWindow().ok_or(DndError::NoWindow)?;
    let view = window.contentView().ok_or(DndError::NoContentView)?;
    let mut items: Vec<Retained<NSDraggingItem>> = Vec::with_capacity(paths.len());
    for path in paths {
        if !path.exists() {
            continue;
        }
        let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
        let item = NSDraggingItem::initWithPasteboardWriter(
            NSDraggingItem::alloc(),
            ProtocolObject::from_ref(&*url),
        );
        let loc = event.locationInWindow();
        let inset = f64::from(crate::tokens::SPACE_LG);
        let preview = f64::from(crate::tokens::ICON_SM);
        item.setDraggingFrame(NSRect {
            origin: NSPoint {
                x: loc.x - inset,
                y: loc.y - inset,
            },
            size: NSSize {
                width: preview,
                height: preview,
            },
        });
        items.push(item);
    }
    if items.is_empty() {
        return Err(DndError::NotReady);
    }
    let array = NSArray::from_retained_slice(&items);
    let source = FileDragSource::new(mtm);
    let _session = view.beginDraggingSessionWithItems_event_source(
        &array,
        &event,
        ProtocolObject::from_ref(&*source),
    );
    // 拖拽会话异步；源对象必须活过 GetData。
    std::mem::forget(source);
    Ok(())
}
