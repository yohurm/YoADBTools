//! 主窗口启动：画布色对齐 `--yohu-bg-base`；工作台 hydrate 后再揭窗。
//! 用户可见的品牌小窗在原生侧；HTML `#yohu-boot` 只盖住隐藏 WebView 的首帧。

use std::sync::OnceLock;
use std::time::{Duration, Instant};

use tauri::webview::WebviewWindow;
use tauri::window::Color;
use tauri::Theme as WindowTheme;

use yohu_protocol::Theme;

/// 与 `Colors.BgBase` / `DarkColors.BgBase` 同值。
pub const CANVAS_LIGHT: Color = Color(0xF1, 0xF3, 0xF5, 255);
pub const CANVAS_DARK: Color = Color(0, 0, 0, 255);
/// 与 `Colors.Fg` / `DarkColors.Fg` 同值（GDI 不画 alpha）。
pub const BRAND_TEXT_LIGHT: Color = Color(0, 0, 0, 255);
pub const BRAND_TEXT_DARK: Color = Color(0xE5, 0xE5, 0xE5, 255);

/// 前端揭窗超时；超时后由壳显示，避免 JS 失败导致永远无窗口。
const REVEAL_FALLBACK_MS: u64 = 2500;
const MAIN_DEFAULT_W: u32 = 1200;
const MAIN_DEFAULT_H: u32 = 800;

static BOOT_ORIGIN: OnceLock<Instant> = OnceLock::new();

/// 进程启动原点。须在 `run()` 入口立刻调用。
pub fn mark_origin() {
    let _ = BOOT_ORIGIN.set(Instant::now());
}

pub fn elapsed_ms() -> u64 {
    BOOT_ORIGIN
        .get()
        .map(|t| t.elapsed().as_millis() as u64)
        .unwrap_or(0)
}

pub fn canvas_color(dark: bool) -> Color {
    if dark {
        CANVAS_DARK
    } else {
        CANVAS_LIGHT
    }
}

pub fn brand_text_color(dark: bool) -> Color {
    if dark {
        BRAND_TEXT_DARK
    } else {
        BRAND_TEXT_LIGHT
    }
}

pub fn resolve_dark(pref: Theme, system_dark: bool) -> bool {
    match pref {
        Theme::Dark => true,
        Theme::Light => false,
        Theme::System => system_dark,
    }
}

fn window_is_dark(win: &WebviewWindow) -> bool {
    matches!(win.theme(), Ok(WindowTheme::Dark))
}

/// 按设置主题铺窗口/WebView 底色；强制浅/深时同步原生 theme。
pub fn prepare_main_window(win: &WebviewWindow, pref: Theme) {
    let dark = resolve_dark(pref, window_is_dark(win));
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
}

#[cfg(windows)]
fn place_on_splash_monitor(win: &WebviewWindow) {
    let size = win
        .outer_size()
        .unwrap_or(tauri::PhysicalSize::new(MAIN_DEFAULT_W, MAIN_DEFAULT_H));
    let (x, y) = crate::native_splash::center_on_splash_work(size.width as i32, size.height as i32);
    if let Err(e) = win.set_position(tauri::PhysicalPosition::new(x, y)) {
        tracing::warn!(ms = elapsed_ms(), x, y, "主窗跟启动小窗同屏居中失败: {e}");
    }
}

/// 幂等揭窗：已可见则跳过。
pub fn show_if_hidden(win: &WebviewWindow, reason: &'static str) {
    if matches!(win.is_visible(), Ok(true)) {
        return;
    }
    #[cfg(windows)]
    place_on_splash_monitor(win);
    if let Err(e) = win.show() {
        tracing::warn!(ms = elapsed_ms(), reason, "揭窗失败: {e}");
        return;
    }
    let _ = win.set_focus();
    #[cfg(windows)]
    crate::native_splash::close();
    tracing::info!(ms = elapsed_ms(), reason, "揭主窗口");
}

/// 工作台已 hydrate：揭主窗并关掉原生小窗。
#[tauri::command(rename = "boot.showMain")]
pub fn boot_show_main(window: WebviewWindow) {
    show_if_hidden(&window, "workbench");
}

/// 页面加载完成不再揭主窗：主窗等启动小窗交接（工作台已 hydrate）。
pub fn on_main_page_finished(label: &str, _win: &WebviewWindow) {
    if label != "main" {
        return;
    }
    tracing::info!(ms = elapsed_ms(), "页面加载完成（主窗仍由启动编排揭开）");
}

/// 主窗一旦可见就关掉原生小窗；超时仍未可见则由壳揭主窗。
pub fn spawn_reveal_fallback(win: WebviewWindow) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(50)).await;
            if matches!(win.is_visible(), Ok(true)) {
                return;
            }
            if elapsed_ms() >= REVEAL_FALLBACK_MS {
                tracing::warn!(ms = elapsed_ms(), "前端未在超时内揭窗，由壳显示主窗口");
                show_if_hidden(&win, "timeout");
                return;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canvas_matches_youi_tokens() {
        let Color(r, g, b, a) = canvas_color(false);
        assert_eq!((r, g, b, a), (0xF1, 0xF3, 0xF5, 255));
        let Color(r, g, b, a) = canvas_color(true);
        assert_eq!((r, g, b, a), (0, 0, 0, 255));
        let Color(r, g, b, a) = brand_text_color(false);
        assert_eq!((r, g, b, a), (0, 0, 0, 255));
        let Color(r, g, b, a) = brand_text_color(true);
        assert_eq!((r, g, b, a), (0xE5, 0xE5, 0xE5, 255));
    }

    #[test]
    fn resolve_dark_follows_preference() {
        assert!(resolve_dark(Theme::Dark, false));
        assert!(!resolve_dark(Theme::Light, true));
        assert!(resolve_dark(Theme::System, true));
        assert!(!resolve_dark(Theme::System, false));
    }
}
