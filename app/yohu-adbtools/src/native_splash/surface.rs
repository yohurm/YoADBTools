//! 启动表面：像素与 clip 契约。
//!
//! ```text
//! window_boot::canvas_bgra(dark)
//!   → BootFrame（不透明矩形 BGRA）
//!     → 小窗 GDI 只 blit 这份 frame（RGN 是显示 clip）
//!     → overlay brand 用同一份 frame
//! overlay fill 只消费 canvas，不读 frame 角点
//! 同屏 clip：splash_radius → 0（铺满 = 盖住目标 HWND 每个像素）
//! 主窗 DWM 圆角在 SplashPlacement::host_corner，揭窗后才属于主窗，不进 overlay clip
//! ```
//!
//! 禁止从 HWND DC 抓像素。禁止把 RGB=0 补成画布色（浅色标题就是黑）。
//! 禁止 `NOREDIRECTIONBITMAP` overlay 在铺满时仍 clip 出透明四角。
//! 禁止 `yohu-motion` 持画布色。

use super::geometry::SplashPlacement;
use crate::window_boot::canvas_bgra;

/// DComp Scale 原点在内容左上。2×2 色块放大成画布，不是 HWND 尺寸。
pub const FILL_CONTENT: i32 = 2;

/// 已绘制的不透明矩形。四角是画布色，不是 region 外的黑。
#[derive(Clone, Debug)]
pub struct BootFrame {
    pub pixels: Vec<u8>,
    pub w: i32,
    pub h: i32,
}

/// 一次启动会话锁定的交接表面。配方与 overlay 只消费这一份。
#[derive(Clone, Debug)]
pub struct BootSurface {
    pub frame: BootFrame,
    pub canvas: [u8; 4],
    pub splash_radius: f32,
}

impl BootFrame {
    pub fn from_dib(bits: &[u8], w: i32, h: i32) -> Self {
        let mut pixels = bits.to_vec();
        force_opaque(&mut pixels);
        Self {
            pixels,
            w: w.max(1),
            h: h.max(1),
        }
    }
}

impl BootSurface {
    pub fn lock(placement: SplashPlacement, frame: BootFrame) -> Self {
        Self {
            frame,
            canvas: canvas_bgra(placement.dark),
            splash_radius: placement.corner as f32,
        }
    }

    /// 同屏 Shared overlay。终点半径 0：fill 铺满后四角仍是不透明画布。
    pub fn shared_clip(&self) -> (f32, f32) {
        (self.splash_radius, 0.0)
    }

    /// 异屏 Exit overlay 保持小窗半径，不放大到主窗。
    pub fn exit_clip(&self) -> (f32, f32) {
        (self.splash_radius, self.splash_radius)
    }
}

pub fn fill_tile(canvas: [u8; 4]) -> [u8; 16] {
    let mut out = [0u8; 16];
    for i in 0..4 {
        out[i * 4..i * 4 + 4].copy_from_slice(&canvas);
    }
    out
}

/// GDI 不写 alpha。这是 BGRA 不透明格式，不是补角。
pub fn force_opaque(pixels: &mut [u8]) {
    for px in pixels.chunks_exact_mut(4) {
        px[3] = 255;
    }
}

/// 矩形 frame 的唯一底色入口。品牌绘制叠在这上面，禁止留下未初始化黑。
pub fn fill_canvas(pixels: &mut [u8], canvas: [u8; 4]) {
    for px in pixels.chunks_exact_mut(4) {
        px.copy_from_slice(&canvas);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::window_boot::canvas_bgra;
    use windows::Win32::Foundation::RECT;

    use super::super::geometry::SplashPlacement;

    fn filled(w: i32, h: i32, canvas: [u8; 4]) -> BootFrame {
        let n = (w.max(1) as usize) * (h.max(1) as usize);
        let mut pixels = vec![0u8; n * 4];
        for i in 0..n {
            pixels[i * 4..i * 4 + 4].copy_from_slice(&canvas);
        }
        BootFrame::from_dib(&pixels, w, h)
    }

    fn pixel(frame: &BootFrame, x: i32, y: i32) -> [u8; 4] {
        let i = ((y as usize) * (frame.w as usize) + (x as usize)) * 4;
        [
            frame.pixels[i],
            frame.pixels[i + 1],
            frame.pixels[i + 2],
            frame.pixels[i + 3],
        ]
    }

    fn in_round_rect(x: i32, y: i32, w: i32, h: i32, radius: i32) -> bool {
        if x < 0 || y < 0 || x >= w || y >= h {
            return false;
        }
        let r = radius.min(w / 2).min(h / 2).max(0);
        if r == 0 {
            return true;
        }
        let r2 = i64::from(r) * i64::from(r);
        let inside = |cx: i32, cy: i32| {
            let dx = i64::from(x - cx);
            let dy = i64::from(y - cy);
            dx * dx + dy * dy <= r2
        };
        if x < r && y < r {
            return inside(r, r);
        }
        if x >= w - r && y < r {
            return inside(w - r, r);
        }
        if x < r && y >= h - r {
            return inside(r, h - r);
        }
        if x >= w - r && y >= h - r {
            return inside(w - r, h - r);
        }
        true
    }

    #[test]
    fn filled_frame_corners_are_canvas_not_black() {
        let canvas = canvas_bgra(false);
        let frame = filled(480, 300, canvas);
        assert_eq!(pixel(&frame, 0, 0), canvas);
        assert_eq!(pixel(&frame, 479, 0), canvas);
        assert_eq!(pixel(&frame, 0, 299), canvas);
        assert_eq!(pixel(&frame, 479, 299), canvas);
        assert_ne!(pixel(&frame, 0, 0), [0, 0, 0, 255]);
        assert!(frame.pixels.chunks_exact(4).all(|px| px[3] == 255));
    }

    #[test]
    fn fill_tile_is_boot_canvas() {
        let light = fill_tile(canvas_bgra(false));
        assert_eq!(&light[0..4], &[0xF5, 0xF3, 0xF1, 255]);
        assert_eq!(&light[12..16], &[0xF5, 0xF3, 0xF1, 255]);
        let dark = fill_tile(canvas_bgra(true));
        assert_eq!(&dark[0..4], &[0x1C, 0x1A, 0x19, 255]);
    }

    #[test]
    fn bbox_corners_are_outside_round_rect() {
        assert!(!in_round_rect(0, 0, 480, 300, 16));
        assert!(!in_round_rect(479, 0, 480, 300, 16));
        assert!(!in_round_rect(0, 299, 480, 300, 16));
        assert!(!in_round_rect(479, 299, 480, 300, 16));
        assert!(in_round_rect(16, 16, 480, 300, 16));
        assert!(in_round_rect(240, 150, 480, 300, 16));
    }

    #[test]
    fn surface_locks_canvas_and_radii_from_placement() {
        let work = RECT {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        };
        let placement = SplashPlacement::from_work(work, 480, 300, 96, false);
        let frame = filled(480, 300, canvas_bgra(false));
        let surface = BootSurface::lock(placement, frame);
        assert_eq!(surface.canvas, canvas_bgra(false));
        assert_eq!(surface.splash_radius, 16.0);
        assert_eq!(placement.host_corner(), 8);
        assert_eq!(surface.shared_clip(), (16.0, 0.0));
        assert_eq!(surface.exit_clip(), (16.0, 16.0));
        assert_eq!(pixel(&surface.frame, 0, 0), surface.canvas);
    }

    #[test]
    fn shared_clip_does_not_punch_host_corners() {
        let work = RECT {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        };
        let placement = SplashPlacement::from_work(work, 480, 300, 96, false);
        let frame = filled(480, 300, canvas_bgra(false));
        let surface = BootSurface::lock(placement, frame);
        let (_, radius_to) = surface.shared_clip();
        assert_eq!(radius_to, 0.0);
        assert_ne!(radius_to, placement.host_corner() as f32);
    }

    #[test]
    fn force_opaque_does_not_recolor_black_ink() {
        let mut px = [0u8, 0, 0, 0, 0xF5, 0xF3, 0xF1, 0];
        force_opaque(&mut px);
        assert_eq!(px, [0, 0, 0, 255, 0xF5, 0xF3, 0xF1, 255]);
    }

    #[test]
    fn fill_canvas_paints_every_pixel_including_corners() {
        let canvas = canvas_bgra(false);
        let mut px = [0u8; 16];
        fill_canvas(&mut px, canvas);
        assert_eq!(&px[0..4], &canvas);
        assert_eq!(&px[12..16], &canvas);
        assert_ne!(&px[0..4], &[0, 0, 0, 255]);
    }
}
