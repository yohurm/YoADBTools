//! 原生窗口 presence：合成器属性（scale / opacity），不是 HWND 布局补间。
//!
//! 桌面壳这条链不是 CSS YoUI 六层，也不是 MVVM：
//! ```text
//! L0 clock    垂直同步、系统窗口动画开关
//! L1 curve    鸿蒙标准 / 减速 / 加速（数值锁 MotionSpec）
//! L2 geom + visual  冻结快照；DComp Visual 的 Offset / Scale / Opacity
//! L3 recipe   同屏共享容器 / 异屏出场
//! L4 splash handover 分类、主窗一次到位、消费配方
//! ```
//! 本 crate 内依赖单向：recipe/visual → geom/curve/clock；禁止引用 `native_splash`。

mod clock;
mod curve;
mod geom;
mod recipe;
mod visual;

pub use clock::motion_allowed;
pub(crate) use clock::pump;
pub(crate) use geom::{rect_center, rect_height, rect_width, xywh};
pub use recipe::{cross_screen, same_screen};
pub use visual::capture;

/// `MotionSpec.spatialPanel` / `--yohu-dur-slow`
pub const SPATIAL_PANEL_MS: u64 = 300;
/// `MotionSpec.spatialExit` / `--yohu-dur-local`
pub const SPATIAL_EXIT_MS: u64 = 200;
/// `MotionSpec.effectsFast` / `--yohu-dur-fast`
pub const EFFECTS_FAST_MS: u64 = 100;
/// 鸿蒙窗口进出场默认 scale 0.7（`WindowAnimationConfig`）。
pub const SHRINK_SCALE: f64 = 0.7;

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
