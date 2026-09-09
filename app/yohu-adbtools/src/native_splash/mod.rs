//! 原生启动小窗（Android Studio / IntelliJ / keyhop 同构）：
//! 在 WebView2 创建之前用 GDI 画出小窗，主窗就绪后再关掉。
//! 禁止第二 WebView splash（tauri#1850：WebView 来不及画启动页）。
//! 交接 overlay / 配方在本模块；时钟与曲线走 `yohu-motion`。禁止引用投屏。

pub(crate) mod geometry;
mod handover;
mod icon;
mod overlay;
mod overlay_geom;
mod paint;
mod recipe;
mod window;

use windows::core::w;
use windows::Win32::System::Registry::{
    RegGetValueW, HKEY_CURRENT_USER, REG_DWORD, RRF_RT_REG_DWORD,
};
use windows::Win32::UI::HiDpi::{
    SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};

use yohu_protocol::Theme;

use crate::window_boot::resolve_dark;

pub use geometry::{center_on_splash_work, last_geometry};
pub use handover::to_main;

pub fn system_dark() -> bool {
    unsafe {
        let mut value: u32 = 1;
        let mut size = std::mem::size_of::<u32>() as u32;
        let mut ty = REG_DWORD;
        let ok = RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
            w!("AppsUseLightTheme"),
            RRF_RT_REG_DWORD,
            Some(&mut ty),
            Some((&mut value as *mut u32).cast()),
            Some(&mut size),
        );
        ok.is_ok() && value == 0
    }
}

pub fn show(pref: Theme) {
    // 必须在第一个 HWND 之前（tao `become_dpi_aware` 同序）。
    // 否则 GetDpiForWindow 恒为 96，480 物理像素在 175% 屏上只有 274×171。
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    let dark = resolve_dark(pref, system_dark());
    window::show(dark);
}

pub fn close() {
    window::close();
}

pub fn hide() {
    window::hide();
}
