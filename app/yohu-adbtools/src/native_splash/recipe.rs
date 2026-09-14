//! 启动交接配方。只服务原生小窗 → 主窗；不引用投屏。
//! 运动采样走 `yohu-motion`；本层只提交起止姿态并等待合成器。
//!
//! 时序（同屏）：cover → morph 铺满（clip 半径 Md→0）→ present 主窗 → fade。
//! 时序（异屏）：cover → scale+fade → present。

use std::time::{Duration, Instant};

use windows::Win32::Foundation::{HWND, RECT};

use yohu_motion::{pump, vsync, MotionSpec};

use super::overlay::{self, OverlayKind};
use super::overlay_geom::{scale_rect_about_center, screen_to_client};
use super::surface::BootSurface;

/// 鸿蒙窗口进出场默认 scale 0.7（`WindowAnimationConfig`）。
const SHRINK_SCALE: f64 = crate::tokens::WINDOW_EXIT_SCALE;

/// overlay 与 splash 同一时段都要泵；不能连续 `wait` 两次。
fn wait_overlay_and_splash(spec: MotionSpec, overlay: HWND, splash: HWND) {
    let duration = Duration::from_millis(spec.duration_ms());
    let start = Instant::now();
    loop {
        pump(overlay);
        pump(splash);
        if start.elapsed() >= duration {
            break;
        }
        vsync();
    }
}

pub fn same_screen(
    surface: BootSurface,
    splash: RECT,
    target: RECT,
    overlay_pump: HWND,
    on_covered: impl FnOnce(),
    on_present: impl FnOnce(),
) {
    let Some(overlay) = overlay::open(target, &surface, OverlayKind::Shared) else {
        on_covered();
        on_present();
        return;
    };
    let from = screen_to_client(target, splash);
    let to = overlay.client();
    overlay.pose_shared(from, 1.0);
    overlay.reveal();
    on_covered();
    let morph = MotionSpec::SpatialPanel;
    overlay.morph_shared(from, to, morph);
    wait_overlay_and_splash(morph, overlay.hwnd(), overlay_pump);
    on_present();
    let fade = MotionSpec::EffectsFast;
    overlay.fade_out(fade);
    wait_overlay_and_splash(fade, overlay.hwnd(), overlay_pump);
}

pub fn cross_screen(
    surface: BootSurface,
    splash: RECT,
    overlay_pump: HWND,
    on_covered: impl FnOnce(),
    on_present: impl FnOnce(),
) {
    let Some(overlay) = overlay::open(splash, &surface, OverlayKind::Exit) else {
        on_covered();
        on_present();
        return;
    };
    let from = overlay.client();
    let to = scale_rect_about_center(from, SHRINK_SCALE);
    overlay.pose_exit(from, 1.0);
    overlay.reveal();
    on_covered();
    let exit = MotionSpec::SpatialExit;
    overlay.morph_exit(from, to, 1.0, 0.0, exit);
    wait_overlay_and_splash(exit, overlay.hwnd(), overlay_pump);
    on_present();
}
