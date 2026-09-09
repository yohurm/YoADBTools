//! 把 L1 曲线采样成 `IDCompositionAnimation`。产品层自己把动画接到 Visual 或 clip。

use windows::Win32::Graphics::DirectComposition::{IDCompositionAnimation, IDCompositionDevice};

const ANIM_SEGMENTS: u32 = 16;

pub fn eased_anim(
    device: &IDCompositionDevice,
    from: f32,
    to: f32,
    ms: u64,
    ease: fn(f64) -> f64,
) -> Option<IDCompositionAnimation> {
    if ms == 0 {
        return None;
    }
    let dur = ms as f32 / 1000.0;
    let anim = unsafe { device.CreateAnimation().ok()? };
    unsafe {
        for i in 0..ANIM_SEGMENTS {
            let u0 = f64::from(i) / f64::from(ANIM_SEGMENTS);
            let u1 = f64::from(i + 1) / f64::from(ANIM_SEGMENTS);
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

/// 按已播时长在 L1 曲线上取样（打断进行中的 DComp 动画时用）。
pub fn ease_at(ease: fn(f64) -> f64, elapsed: std::time::Duration, ms: u64) -> f32 {
    if ms == 0 {
        return 1.0;
    }
    let u = (elapsed.as_secs_f64() / (ms as f64 / 1000.0)).clamp(0.0, 1.0);
    ease(u) as f32
}
