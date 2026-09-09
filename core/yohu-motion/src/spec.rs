//! L1 MotionSpec —— 与 `@yohu/ui` `tokens/motion.ts` 同名同值。
//! 产品层只点规格名，禁止再写 300 / 自造贝塞尔。

use crate::curve::{ease_accel, ease_decel, ease_emphasized, ease_standard};

/// 语义规格。时长取自鸿蒙分级；曲线按元素四类（进场减速 / 出场加速 / 持续标准）。
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MotionSpec {
    /// hover / press 色：100ms standard
    EffectsFast,
    /// 淡入：160ms decel
    EffectsEnter,
    /// 淡出：200ms accel
    EffectsExit,
    /// 开关 / 指示器位移：150ms（CSS 走弹簧；原生贝塞尔回退 standard）
    SpatialSmall,
    /// 滑块宽高：200ms（CSS 软弹簧；原生回退 standard）
    SpatialStretch,
    /// 折叠高度：200ms emphasized
    SpatialLocal,
    /// 侧栏 / 共享容器：300ms standard
    SpatialPanel,
    /// Dialog 入场：350ms decel
    SpatialEnter,
    /// Dialog / 卡片出场：200ms accel
    SpatialExit,
}

impl MotionSpec {
    /// `--yohu-dur-*` 毫秒。弹簧规格仍给感知档，物理 settle 只在 CSS `linear()`。
    pub const fn duration_ms(self) -> u64 {
        match self {
            Self::EffectsFast => 100,
            Self::SpatialSmall => 150,
            Self::EffectsEnter => 160,
            Self::EffectsExit | Self::SpatialStretch | Self::SpatialLocal | Self::SpatialExit => 200,
            Self::SpatialPanel => 300,
            Self::SpatialEnter => 350,
        }
    }

    /// 原生合成器采样用的贝塞尔。弹簧槽位回退 standard，避免第二套物理积分。
    pub fn ease(self) -> fn(f64) -> f64 {
        match self {
            Self::EffectsFast | Self::SpatialPanel | Self::SpatialSmall | Self::SpatialStretch => {
                ease_standard
            }
            Self::EffectsEnter | Self::SpatialEnter => ease_decel,
            Self::EffectsExit | Self::SpatialExit => ease_accel,
            Self::SpatialLocal => ease_emphasized,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn durations_match_youi_motion_spec() {
        assert_eq!(MotionSpec::EffectsFast.duration_ms(), 100);
        assert_eq!(MotionSpec::SpatialSmall.duration_ms(), 150);
        assert_eq!(MotionSpec::EffectsEnter.duration_ms(), 160);
        assert_eq!(MotionSpec::EffectsExit.duration_ms(), 200);
        assert_eq!(MotionSpec::SpatialStretch.duration_ms(), 200);
        assert_eq!(MotionSpec::SpatialLocal.duration_ms(), 200);
        assert_eq!(MotionSpec::SpatialPanel.duration_ms(), 300);
        assert_eq!(MotionSpec::SpatialEnter.duration_ms(), 350);
        assert_eq!(MotionSpec::SpatialExit.duration_ms(), 200);
    }

    #[test]
    fn enter_uses_decel_exit_uses_accel() {
        let mid = 0.3;
        assert!(MotionSpec::SpatialEnter.ease()(mid) > MotionSpec::SpatialPanel.ease()(mid));
        assert!(MotionSpec::SpatialExit.ease()(mid) < MotionSpec::SpatialPanel.ease()(mid));
        assert!(MotionSpec::SpatialLocal.ease()(mid) > MotionSpec::SpatialPanel.ease()(mid));
    }
}
