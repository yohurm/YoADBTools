//! 主窗口启动：画布色对齐 `--yohu-bg-base`；工作台 hydrate 后再揭窗。
//! Windows 选屏只消费启动工作区（小窗锁定的主屏），禁止 Tao `center` / 光标屏第二套。
//! 揭窗走原生小窗交接（同屏共享容器 / 异屏出场）；HTML `#yohu-boot` 只盖住隐藏 WebView 的首帧。

use std::sync::OnceLock;
use std::time::{Duration, Instant};

use tauri::webview::WebviewWindow;
use tauri::window::Color;
use tauri::Theme as WindowTheme;

use yohu_protocol::Theme;

/// 与 `Colors.BgBase` / `DarkColors.BgBase` 同值。
pub const CANVAS_LIGHT: Color = Color(0xF1, 0xF3, 0xF5, 255);
pub const CANVAS_DARK: Color = Color(0x19, 0x1A, 0x1C, 255);
/// 与 `Colors.Fg` / `DarkColors.Fg` 同值（GDI 不画 alpha）。
pub const BRAND_TEXT_LIGHT: Color = Color(0, 0, 0, 255);
pub const BRAND_TEXT_DARK: Color = Color(0xE5, 0xE5, 0xE5, 255);

/// 前端揭窗超时；超时后由壳显示，避免 JS 失败导致永远无窗口。
const REVEAL_FALLBACK_MS: u64 = 2500;
/// 与 `@yohu/ui` `Layout.WindowDefaultW/H` 同值。
pub(crate) const MAIN_DEFAULT_W: u32 = 1200;
pub(crate) const MAIN_DEFAULT_H: u32 = 800;

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

/// DXGI / GDI DIB 用 B8G8R8A8。启动 overlay 填色只走这里，禁止从快照角点猜。
pub fn canvas_bgra(dark: bool) -> [u8; 4] {
    let Color(r, g, b, a) = canvas_color(dark);
    [b, g, r, a]
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

/// 启动会话已锁则用小窗那份；无 splash（非 Windows 或尚未 store_geometry）为 None。
fn boot_session_dark() -> Option<bool> {
    #[cfg(windows)]
    if crate::native_splash::last_geometry().is_some() {
        return Some(crate::native_splash::boot_dark());
    }
    None
}

/// 主窗 `dark` 与启动小窗同一份：有会话用 `boot_dark` 当 System 探针，否则回退窗口。
fn prepare_dark(pref: Theme, boot: Option<bool>, window_dark: bool) -> bool {
    resolve_dark(pref, boot.unwrap_or(window_dark))
}

/// 按设置主题铺窗口/WebView 底色；强制浅/深时同步原生 theme。
pub fn prepare_main_window(win: &WebviewWindow, pref: Theme) {
    let boot = boot_session_dark();
    // 有会话不采样 win.theme()，避免第三条探针跟小窗分叉。
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
    place_on_boot_work(win);
}

/// 把 Tao 坐标写到启动工作区。交接里的 `SetWindowPos` 不更新 Tao，揭窗前必须再写一次。
#[cfg(windows)]
fn place_on_boot_work(win: &WebviewWindow) {
    let size = win
        .outer_size()
        .unwrap_or(tauri::PhysicalSize::new(MAIN_DEFAULT_W, MAIN_DEFAULT_H));
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

/// 幂等揭窗：已可见则跳过。Windows 上由原生小窗按同屏/异屏配方交接后再揭。
pub fn show_if_hidden(win: &WebviewWindow, reason: &'static str) {
    if matches!(win.is_visible(), Ok(true)) {
        return;
    }
    #[cfg(windows)]
    {
        match win.hwnd() {
            Ok(hwnd) => {
                let sync_tao = crate::native_splash::to_main(windows::Win32::Foundation::HWND(
                    hwnd.0 as *mut _,
                ));
                // 另一路正在播交接：禁止 win.show() 把工作台从 overlay 底下抢出来。
                if !sync_tao {
                    return;
                }
                // 交接可能已用 ShowWindow 揭 HWND，Tao 的 VISIBLE 仍是 false。
                // 先把 Tao 坐标写成启动工作区，再 show：否则会写回创建时的光标屏位置。
                place_on_boot_work(win);
                if let Err(e) = win.show() {
                    tracing::warn!(ms = elapsed_ms(), reason, "同步 Tao 可见状态失败: {e}");
                }
                let _ = win.set_focus();
                tracing::info!(ms = elapsed_ms(), reason, "揭主窗口");
                return;
            }
            Err(e) => tracing::warn!(ms = elapsed_ms(), "揭窗时无法取得主窗 HWND: {e}"),
        }
        place_on_boot_work(win);
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

/// 主窗一旦可见就结束等待；超时从**壳 setup 完成**起算，不从进程入口起算。
/// 入口已花在原生小窗 + WebView2 创建上，再用 `elapsed_ms()` 会在 hydrate 前抢跑交接。
pub fn spawn_reveal_fallback(win: WebviewWindow) {
    tauri::async_runtime::spawn(async move {
        let start = Instant::now();
        loop {
            tokio::time::sleep(Duration::from_millis(50)).await;
            if matches!(win.is_visible(), Ok(true)) {
                return;
            }
            if start.elapsed() >= Duration::from_millis(REVEAL_FALLBACK_MS) {
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
        assert_eq!((r, g, b, a), (0x19, 0x1A, 0x1C, 255));
        assert_eq!(canvas_bgra(false), [0xF5, 0xF3, 0xF1, 255]);
        assert_eq!(canvas_bgra(true), [0x1C, 0x1A, 0x19, 255]);
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
    fn window_defaults_match_layout_tokens() {
        assert_eq!(MAIN_DEFAULT_W, 1200);
        assert_eq!(MAIN_DEFAULT_H, 800);
    }
}
