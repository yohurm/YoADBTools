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
use yohu_protocol::{IpcError, IpcErrorCode};

use crate::commands::ipc_code;

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

pub fn begin_file_drag(paths: &[PathBuf]) -> Result<(), IpcError> {
    let mtm = MainThreadMarker::new()
        .ok_or_else(|| ipc_code(IpcErrorCode::Internal, "拖出必须在主线程启动"))?;
    if paths.is_empty() {
        return Err(ipc_code(IpcErrorCode::InvalidArgs, "没有可拖出的项目"));
    }
    let app = NSApplication::sharedApplication(mtm);
    let event = app
        .currentEvent()
        .ok_or_else(|| ipc_code(IpcErrorCode::Internal, "没有可用的拖动手势"))?;
    let window = app
        .keyWindow()
        .ok_or_else(|| ipc_code(IpcErrorCode::Internal, "没有可用的主窗口"))?;
    let view = window
        .contentView()
        .ok_or_else(|| ipc_code(IpcErrorCode::Internal, "主窗口没有 contentView"))?;
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
        item.setDraggingFrame(NSRect {
            origin: NSPoint {
                x: loc.x - 16.0,
                y: loc.y - 16.0,
            },
            size: NSSize {
                width: 32.0,
                height: 32.0,
            },
        });
        items.push(item);
    }
    if items.is_empty() {
        return Err(ipc_code(IpcErrorCode::Internal, "拖出文件尚未就绪"));
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
