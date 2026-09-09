//! yohu-motion — 原生动效原语（与 `yohu-runtime` / `yohu-protocol` 并列，互不依赖）。
//!
//! 时长与曲线锁 YoUI MotionSpec。Windows 上另提供合成器时钟与 `IDCompositionAnimation` 采样。
//! 禁止产品 HWND 树（启动 overlay / 投屏 clip）、wire 类型、设备、Tauri。

mod curve;

pub use curve::{ease_accel, ease_standard};

/// `MotionSpec.spatialPanel` / `--yohu-dur-slow`
pub const SPATIAL_PANEL_MS: u64 = 300;
/// `MotionSpec.spatialExit` / `--yohu-dur-local`
pub const SPATIAL_EXIT_MS: u64 = 200;
/// `MotionSpec.effectsFast` / `--yohu-dur-fast`
pub const EFFECTS_FAST_MS: u64 = 100;

#[cfg(windows)]
mod clock;
#[cfg(windows)]
mod dcomp;
#[cfg(windows)]
mod geom;

#[cfg(windows)]
pub use clock::{motion_allowed, pump, wait};
#[cfg(windows)]
pub use dcomp::{ease_at, eased_anim};
#[cfg(windows)]
pub use geom::{rect_center, rect_height, rect_width, xywh};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn durations_match_motion_spec() {
        assert_eq!(SPATIAL_PANEL_MS, 300);
        assert_eq!(SPATIAL_EXIT_MS, 200);
        assert_eq!(EFFECTS_FAST_MS, 100);
    }
}
