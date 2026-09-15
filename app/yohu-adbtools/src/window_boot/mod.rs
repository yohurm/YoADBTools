//! 主窗口启动：画布色对齐 `--yohu-bg-base`；工作台 hydrate 后再揭窗。
//! 成功揭窗入口是 `commands::boot::boot_show_main`。
//! 文档是浏览器错误页时走失败出口，禁止超时双轨冒充成功。

mod colors;
mod placement;

use std::sync::OnceLock;
use std::time::Instant;

use tauri::webview::WebviewWindow;
use tauri::Theme as WindowTheme;

use yohu_protocol::Theme;

use crate::theme_spec::resolve_dark;

pub use colors::canvas_color;

static BOOT_ORIGIN: OnceLock<Instant> = OnceLock::new();

pub fn mark_origin() {
    let _ = BOOT_ORIGIN.set(Instant::now());
}

pub fn elapsed_ms() -> u64 {
    BOOT_ORIGIN
        .get()
        .map(|t| t.elapsed().as_millis() as u64)
        .unwrap_or(0)
}

fn window_is_dark(win: &WebviewWindow) -> bool {
    matches!(win.theme(), Ok(WindowTheme::Dark))
}

fn boot_session_dark() -> Option<bool> {
    #[cfg(windows)]
    if crate::native_splash::last_geometry().is_some() {
        return Some(crate::native_splash::boot_dark());
    }
    None
}

fn prepare_dark(pref: Theme, boot: Option<bool>, window_dark: bool) -> bool {
    resolve_dark(pref, boot.unwrap_or(window_dark))
}

pub fn prepare_main_window(win: &WebviewWindow, pref: Theme) {
    let boot = boot_session_dark();
    let dark = prepare_dark(pref, boot, boot.is_none() && window_is_dark(win));
    if matches!(pref, Theme::Dark | Theme::Light) {
        let theme = if dark {
            WindowTheme::Dark
        } else {
            WindowTheme::Light
        };
        if let Err(e) = win.set_theme(Some(theme)) {
            tracing::warn!(ms = elapsed_ms(), "设置窗口主题失败: {e}");
        }
    }
    if let Err(e) = win.set_background_color(Some(canvas_color(dark))) {
        tracing::warn!(ms = elapsed_ms(), "设置窗口底色失败: {e}");
    } else {
        tracing::info!(ms = elapsed_ms(), dark, "主窗画布色已对齐");
    }
    #[cfg(windows)]
    placement::place_on_boot_work(win);
}

/// 幂等揭窗：已可见则跳过。Windows 上由原生小窗按同屏/异屏配方交接后再揭。
pub fn show_if_hidden(win: &WebviewWindow, reason: &'static str) {
    if matches!(win.is_visible(), Ok(true)) {
        return;
    }
    #[cfg(windows)]
    {
        match win.hwnd() {
            Ok(hwnd) => {
                crate::native_splash::to_main(windows::Win32::Foundation::HWND(hwnd.0 as *mut _));
                placement::place_on_boot_work(win);
                if let Err(e) = win.show() {
                    tracing::warn!(ms = elapsed_ms(), reason, "同步 Tao 可见状态失败: {e}");
                }
                let _ = win.set_focus();
                tracing::info!(ms = elapsed_ms(), reason, "揭主窗口");
                return;
            }
            Err(e) => tracing::warn!(ms = elapsed_ms(), "揭窗时无法取得主窗 HWND: {e}"),
        }
        placement::place_on_boot_work(win);
    }
    if let Err(e) = win.show() {
        tracing::warn!(ms = elapsed_ms(), reason, "揭窗失败: {e}");
        return;
    }
    let _ = win.set_focus();
    #[cfg(windows)]
    crate::native_splash::close();
    tracing::info!(ms = elapsed_ms(), reason, "揭主窗口");
}

/// WebView 导航到了错误文档：工作台 JS 不会跑，`boot.showMain` 永远不会来。
/// 这是失败信号，不是超时。`about:blank` / `http(s)` / `tauri` 应用页不算失败。
pub fn page_load_failed(url: &str) -> bool {
    let scheme = url.split_once(':').map(|(s, _)| s).unwrap_or("");
    matches!(scheme, "chrome-error" | "edge-error" | "chrome")
        || url.contains("chromewebdata")
}

pub fn on_main_page_finished(label: &str, url: &str, win: &WebviewWindow) {
    if label != "main" {
        return;
    }
    if page_load_failed(url) {
        tracing::error!(
            ms = elapsed_ms(),
            url,
            "工作台文档是错误页，揭窗以免钉死启动小窗"
        );
        show_if_hidden(win, "page-failed");
        return;
    }
    tracing::info!(
        ms = elapsed_ms(),
        url,
        "页面加载完成（主窗仍由启动编排揭开）"
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepare_dark_follows_boot_session_when_locked() {
        assert!(prepare_dark(Theme::System, Some(true), false));
        assert!(!prepare_dark(Theme::System, Some(false), true));
        assert!(!prepare_dark(Theme::Light, Some(true), true));
        assert!(prepare_dark(Theme::Dark, Some(false), false));
    }

    #[test]
    fn prepare_dark_falls_back_to_window_without_boot() {
        assert!(prepare_dark(Theme::System, None, true));
        assert!(!prepare_dark(Theme::System, None, false));
        assert!(!prepare_dark(Theme::Light, None, true));
        assert!(prepare_dark(Theme::Dark, None, false));
    }

    #[test]
    fn page_load_failed_only_error_documents() {
        assert!(page_load_failed("chrome-error://chromewebdata/"));
        assert!(page_load_failed("chrome://network-error/"));
        assert!(!page_load_failed("about:blank"));
        assert!(!page_load_failed("http://localhost:1420/"));
        assert!(!page_load_failed("https://tauri.localhost/"));
        assert!(!page_load_failed("tauri://localhost/"));
    }
}
