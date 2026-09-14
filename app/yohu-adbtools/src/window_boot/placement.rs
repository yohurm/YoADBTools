//! 主窗落到启动工作区。禁止 Tao `center` / 光标屏第二套。

use tauri::webview::WebviewWindow;

use crate::tokens::{WINDOW_DEFAULT_H, WINDOW_DEFAULT_W};

use super::elapsed_ms;

/// 把 Tao 坐标写到启动工作区。交接里的 `SetWindowPos` 不更新 Tao，揭窗前必须再写一次。
#[cfg(windows)]
pub fn place_on_boot_work(win: &WebviewWindow) {
    let size = win
        .outer_size()
        .unwrap_or(tauri::PhysicalSize::new(WINDOW_DEFAULT_W, WINDOW_DEFAULT_H));
    let (x, y) = crate::native_splash::center_on_splash_work(size.width as i32, size.height as i32);
    if let Err(e) = win.set_position(tauri::PhysicalPosition::new(x, y)) {
        tracing::warn!(ms = elapsed_ms(), x, y, "主窗落到启动工作区失败: {e}");
    } else {
        tracing::info!(
            ms = elapsed_ms(),
            x,
            y,
            w = size.width,
            h = size.height,
            "主窗已落到启动工作区"
        );
    }
}
