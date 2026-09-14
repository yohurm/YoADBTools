//! 把 L1 曲线采样成 `IDCompositionAnimation`。产品层自己把动画接到 Visual 或 clip。

use std::time::Duration;

use windows::Win32::Graphics::DirectComposition::{IDCompositionAnimation, IDCompositionDevice};

use crate::spec::MotionSpec;

/// DComp `AddCubic` 只接受时间多项式。L1 是 y(x) 贝塞尔，这里用等分折线逼近。
/// 16 段对单调三次足够平滑，再密只增 Commit 成本、不改规格时长。
const CUBIC_SAMPLE_SEGMENTS: u32 = 16;

pub fn eased_anim(
    device: &IDCompositionDevice,
    from: f32,
    to: f32,
    spec: MotionSpec,
) -> Option<IDCompositionAnimation> {
    let ms = spec.duration_ms();
    if ms == 0 {
        return None;
    }
    let ease = spec.ease();
    let dur = ms as f32 / 1000.0;
    let anim = unsafe { device.CreateAnimation().ok()? };
    unsafe {
        for i in 0..CUBIC_SAMPLE_SEGMENTS {
            let u0 = f64::from(i) / f64::from(CUBIC_SAMPLE_SEGMENTS);
            let u1 = f64::from(i + 1) / f64::from(CUBIC_SAMPLE_SEGMENTS);
            let y0 = from + (to - from) * ease(u0) as f32;
            let y1 = from + (to - from) * ease(u1) as f32;
            let t0 = u0 as f32 * dur;
            let dt = ((u1 - u0) as f32 * dur).max(1e-6);
            let slope = (y1 - y0) / dt;
            anim.AddCubic(f64::from(t0), y0, slope, 0.0, 0.0).ok()?;
        }
        anim.End(f64::from(dur), to).ok()?;
    }
    Some(anim)
}

/// 按已播时长在规格曲线上取样（打断进行中的 DComp 动画时用）。
pub fn ease_at(spec: MotionSpec, elapsed: Duration) -> f32 {
    let ms = spec.duration_ms();
    if ms == 0 {
        return 1.0;
    }
    let u = (elapsed.as_secs_f64() / (ms as f64 / 1000.0)).clamp(0.0, 1.0);
    spec.ease()(u) as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ease_at_follows_spec_duration() {
        let spec = MotionSpec::SpatialPanel;
        assert!((ease_at(spec, Duration::ZERO) - spec.ease()(0.0) as f32).abs() < 1e-6);
        assert!((ease_at(spec, Duration::from_millis(spec.duration_ms())) - 1.0).abs() < 1e-5);
        let mid = Duration::from_millis(spec.duration_ms() / 2);
        let expected = spec.ease()(0.5) as f32;
        assert!((ease_at(spec, mid) - expected).abs() < 1e-5);
    }
}
