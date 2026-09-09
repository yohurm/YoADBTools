//! L1：与 `--yohu-ease-standard/accel` 同值。禁止另起贝塞尔。减速曲线只在单测锁 token。

/// HarmonyOS 标准 `cubic-bezier(0.4, 0, 0.2, 1)`：持续在视线内。
pub fn ease_standard(t: f64) -> f64 {
    cubic_bezier(0.4, 0.0, 0.2, 1.0, t.clamp(0.0, 1.0))
}

/// 减速 `cubic-bezier(0, 0, 0.4, 1)`：与 `--yohu-ease-decel` 同值。
#[cfg(test)]
pub fn ease_decel(t: f64) -> f64 {
    cubic_bezier(0.0, 0.0, 0.4, 1.0, t.clamp(0.0, 1.0))
}

/// 加速 `cubic-bezier(0.4, 0, 1, 1)`：出场。
pub fn ease_accel(t: f64) -> f64 {
    cubic_bezier(0.4, 0.0, 1.0, 1.0, t.clamp(0.0, 1.0))
}

fn cubic_bezier(x1: f64, y1: f64, x2: f64, y2: f64, x: f64) -> f64 {
    let mut t = x;
    for _ in 0..8 {
        let x_est = sample_curve(t, x1, x2);
        let dx = sample_curve_d(t, x1, x2);
        if dx.abs() < 1e-6 {
            break;
        }
        t = (t - (x_est - x) / dx).clamp(0.0, 1.0);
    }
    sample_curve(t, y1, y2)
}

fn sample_curve(t: f64, a: f64, b: f64) -> f64 {
    let u = 1.0 - t;
    3.0 * u * u * t * a + 3.0 * u * t * t * b + t * t * t
}

fn sample_curve_d(t: f64, a: f64, b: f64) -> f64 {
    let u = 1.0 - t;
    3.0 * u * u * a + 6.0 * u * t * (b - a) + 3.0 * t * t * (1.0 - b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eases_are_bounded_and_ordered() {
        for ease in [ease_standard, ease_decel, ease_accel] {
            assert_eq!(ease(0.0), 0.0);
            assert!((ease(1.0) - 1.0).abs() < 1e-6);
            assert!(ease(0.25) < ease(0.75));
        }
        assert!(ease_decel(0.3) > ease_standard(0.3));
        assert!(ease_accel(0.3) < ease_standard(0.3));
    }
}
