//! L1 MotionSpec —— 与 `@yohu/ui` `tokens/motion.ts` 同名同值。
//! 产品层只点规格名，禁止再写 300 / 自造贝塞尔。数值由 testdata/motion_spec.json 锁死。

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
    /// 共享容器 / 预览 / swap：300ms standard
    SpatialPanel,
    /// 侧栏开合：300ms（CSS 软弹簧；原生回退 standard）
    SpatialRail,
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
            Self::SpatialPanel | Self::SpatialRail => 300,
            Self::SpatialEnter => 350,
        }
    }

    /// 原生合成器采样用的贝塞尔。弹簧槽位回退 standard，避免第二套物理积分。
    pub fn ease(self) -> fn(f64) -> f64 {
        match self {
            Self::EffectsFast
            | Self::SpatialPanel
            | Self::SpatialRail
            | Self::SpatialSmall
            | Self::SpatialStretch => {
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
    use crate::curve::cubic_bezier;
    use std::collections::HashMap;

    #[derive(serde::Deserialize)]
    struct SpecRow {
        #[serde(rename = "durationMs")]
        duration_ms: u64,
        easing: String,
        #[serde(rename = "controlPoints")]
        control_points: [f64; 4],
    }

    fn fixture() -> HashMap<String, SpecRow> {
        serde_json::from_str(include_str!("../testdata/motion_spec.json")).expect("fixture")
    }

    fn spec_by_name(name: &str) -> MotionSpec {
        match name {
            "effectsFast" => MotionSpec::EffectsFast,
            "effectsEnter" => MotionSpec::EffectsEnter,
            "effectsExit" => MotionSpec::EffectsExit,
            "spatialSmall" => MotionSpec::SpatialSmall,
            "spatialStretch" => MotionSpec::SpatialStretch,
            "spatialLocal" => MotionSpec::SpatialLocal,
            "spatialPanel" => MotionSpec::SpatialPanel,
            "spatialRail" => MotionSpec::SpatialRail,
            "spatialEnter" => MotionSpec::SpatialEnter,
            "spatialExit" => MotionSpec::SpatialExit,
            other => panic!("unknown MotionSpec name {other}"),
        }
    }

    const ALL_NAMES: &[&str] = &[
        "effectsFast",
        "effectsEnter",
        "effectsExit",
        "spatialSmall",
        "spatialStretch",
        "spatialLocal",
        "spatialPanel",
        "spatialRail",
        "spatialEnter",
        "spatialExit",
    ];

    #[test]
    fn specs_match_shared_testdata() {
        let rows = fixture();
        assert_eq!(rows.len(), ALL_NAMES.len());
        for name in ALL_NAMES {
            let row = rows.get(*name).unwrap_or_else(|| panic!("missing {name}"));
            let spec = spec_by_name(name);
            assert_eq!(spec.duration_ms(), row.duration_ms, "{name} duration");
            assert!(!row.easing.is_empty(), "{name} easing");
            let [x1, y1, x2, y2] = row.control_points;
            for t in [0.0, 0.25, 0.5, 0.75, 1.0] {
                let expected = cubic_bezier(x1, y1, x2, y2, t);
                let got = spec.ease()(t);
                assert!(
                    (got - expected).abs() < 1e-5,
                    "{name} ease({t}): {got} != {expected}"
                );
            }
        }
    }

    #[test]
    fn enter_uses_decel_exit_uses_accel() {
        let mid = 0.3;
        assert!(MotionSpec::SpatialEnter.ease()(mid) > MotionSpec::SpatialPanel.ease()(mid));
        assert!(MotionSpec::SpatialExit.ease()(mid) < MotionSpec::SpatialPanel.ease()(mid));
        assert!(MotionSpec::SpatialLocal.ease()(mid) > MotionSpec::SpatialPanel.ease()(mid));
    }
}
