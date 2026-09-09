//! 启动交接配方。只服务原生小窗 → 主窗；不引用投屏。
//! 运动采样走 `yohu-motion`；本层只提交起止姿态并等待合成器。
//!
//! 时序（同屏）：cover → morph 铺满 → present 主窗（仍被不透明 overlay 盖住）→ fade。
//! 时序（异屏）：cover → scale+fade → present。

use std::time::Duration;

use windows::Win32::Foundation::{HWND, RECT};

use yohu_motion::{
    ease_accel, ease_standard, wait, EFFECTS_FAST_MS, SPATIAL_EXIT_MS, SPATIAL_PANEL_MS,
};

use super::overlay::{self, OverlayKind, Snapshot};
use super::overlay_geom::{scale_rect_about_center, screen_to_client};

/// 鸿蒙窗口进出场默认 scale 0.7（`WindowAnimationConfig`）。
const SHRINK_SCALE: f64 = 0.7;

pub fn same_screen(
    snap: Snapshot,
    splash: RECT,
    target: RECT,
    overlay_pump: HWND,
    on_covered: impl FnOnce(),
    on_present: impl FnOnce(),
) {
    let Some(overlay) = overlay::open(target, &snap, OverlayKind::Shared) else {
        on_covered();
        on_present();
        return;
    };
    let from = screen_to_client(target, splash);
    let to = overlay.client();
    overlay.pose_shared(from, 1.0);
    overlay.reveal();
    on_covered();
    overlay.morph_shared(from, to, 1.0, 1.0, SPATIAL_PANEL_MS, ease_standard);
    wait(
        Duration::from_millis(SPATIAL_PANEL_MS),
        overlay.hwnd(),
        overlay_pump,
    );
    on_present();
    overlay.morph_shared(to, to, 1.0, 0.0, EFFECTS_FAST_MS, ease_accel);
    wait(
        Duration::from_millis(EFFECTS_FAST_MS),
        overlay.hwnd(),
        overlay_pump,
    );
}

pub fn cross_screen(
    snap: Snapshot,
    splash: RECT,
    overlay_pump: HWND,
    on_covered: impl FnOnce(),
    on_present: impl FnOnce(),
) {
    let Some(overlay) = overlay::open(splash, &snap, OverlayKind::Exit) else {
        on_covered();
        on_present();
        return;
    };
    let from = overlay.client();
    let to = scale_rect_about_center(from, SHRINK_SCALE);
    overlay.pose_exit(from, 1.0);
    overlay.reveal();
    on_covered();
    overlay.morph_exit(from, to, 1.0, 0.0, SPATIAL_EXIT_MS, ease_accel);
    wait(
        Duration::from_millis(SPATIAL_EXIT_MS),
        overlay.hwnd(),
        overlay_pump,
    );
    on_present();
}
