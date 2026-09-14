//! 揭窗：薄转发 `window_boot::show_if_hidden`。唯一入口 `boot.showMain`。

use tauri::webview::WebviewWindow;

#[tauri::command(rename = "boot.showMain")]
pub fn boot_show_main(window: WebviewWindow) {
    crate::window_boot::show_if_hidden(&window, "workbench");
}
