//! DComp overlay 门面：HWND + swapchain + 树。禁止 UpdateLayeredWindow，禁止改 HWND 尺寸。

use windows::Win32::Foundation::RECT;
use windows::Win32::UI::WindowsAndMessaging::DestroyWindow;

use super::geometry::{rect_height, rect_width};
use super::overlay_tree;
use super::overlay_window;
use super::surface::BootSurface;

pub use overlay_tree::{Overlay, OverlayKind};

pub fn open(screen: RECT, surface: &BootSurface, kind: OverlayKind) -> Option<Overlay> {
    let w = rect_width(screen).max(1);
    let h = rect_height(screen).max(1);
    let hwnd = overlay_window::create_hwnd(screen.left, screen.top, w, h)?;
    match overlay_tree::attach(hwnd, w, h, surface, kind) {
        Some(overlay) => Some(overlay),
        None => {
            unsafe {
                let _ = DestroyWindow(hwnd);
            }
            None
        }
    }
}
