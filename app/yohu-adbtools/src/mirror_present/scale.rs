//! 触控映射、纹理裁切、avail 内显示矩形。
//!
//! dest = contain(avail, 内容)。核种类在这里判定，取样在各端 Scale 模块。
//! Windows 占用盒 fill↔dest 走 DirectComposition clip（时长/曲线用 `yohu-motion`）。
//! macOS 走 NSView 卡片 frame + 圆角。禁止 CSS 占用过渡。
#![cfg_attr(not(windows), allow(dead_code))]

/// 在可用区内按画面宽高比 contain，返回贴合盒相对区原点的偏移与尺寸。
/// 无画面尺寸时铺满。
pub fn contain_in_zone(
    zone_w: u32,
    zone_h: u32,
    video_w: u32,
    video_h: u32,
) -> (i32, i32, u32, u32) {
    if zone_w == 0 || zone_h == 0 {
        return (0, 0, zone_w, zone_h);
    }
    if video_w == 0 || video_h == 0 {
        return (0, 0, zone_w, zone_h);
    }
    let aspect = video_w as f64 / video_h as f64;
    let width = (zone_w as f64).min(zone_h as f64 * aspect);
    let height = width / aspect;
    let w = width.round().max(1.0) as u32;
    let h = height.round().max(1.0) as u32;
    let w = w.min(zone_w);
    let h = h.min(zone_h);
    let x = (zone_w as i32 - w as i32) / 2;
    let y = (zone_h as i32 - h as i32) / 2;
    (x, y, w, h)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Letterbox {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    /// 1:1 或整数倍放大才 nearest。缩小走面积核，此旗为 false。
    pub nearest: bool,
    pub crop_w: u32,
    pub crop_h: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScaleKernel {
    /// 1:1 或整数倍放大：点采。
    Nearest,
    /// 缩小：每个 dest 像素盖住源足迹。
    Area,
}

/// Fit 只给 dest。核只看 src 与 dest 像素数，不改盒子。
pub fn scale_kernel(src_w: u32, src_h: u32, dest: Letterbox) -> ScaleKernel {
    if dest.width < src_w.max(1) || dest.height < src_h.max(1) {
        ScaleKernel::Area
    } else {
        ScaleKernel::Nearest
    }
}

/// 内容在 avail 里的唯一显示矩形。占用 = dest。
pub fn present_dest(avail_w: u32, avail_h: u32, content_w: u32, content_h: u32) -> Letterbox {
    if content_w == 0 || content_h == 0 || avail_w == 0 || avail_h == 0 {
        return Letterbox {
            x: 0,
            y: 0,
            width: avail_w.max(1),
            height: avail_h.max(1),
            nearest: false,
            crop_w: content_w,
            crop_h: content_h,
        };
    }
    if content_w <= avail_w && content_h <= avail_h {
        let k = (avail_w / content_w).min(avail_h / content_h);
        let (width, height) = if k >= 2 {
            (content_w * k, content_h * k)
        } else {
            (content_w, content_h)
        };
        return Letterbox {
            x: (avail_w as i32 - width as i32) / 2,
            y: (avail_h as i32 - height as i32) / 2,
            width,
            height,
            nearest: true,
            crop_w: content_w,
            crop_h: content_h,
        };
    }
    let (x, y, width, height) = contain_in_zone(avail_w, avail_h, content_w, content_h);
    Letterbox {
        x,
        y,
        width,
        height,
        nearest: false,
        crop_w: content_w,
        crop_h: content_h,
    }
}

/// 硬解纹理可大于 session：裁到内容矩形（左上对齐）。
pub fn content_source_size(
    content_w: u32,
    content_h: u32,
    texture_w: u32,
    texture_h: u32,
) -> (u32, u32) {
    (
        content_w.min(texture_w).max(1),
        content_h.min(texture_h).max(1),
    )
}

pub fn map_client_to_video(
    client_x: i32,
    client_y: i32,
    box_: Letterbox,
    video_w: u32,
    video_h: u32,
) -> Option<(u32, u32)> {
    if box_.width == 0 || box_.height == 0 || video_w == 0 || video_h == 0 {
        return None;
    }
    let x = client_x - box_.x;
    let y = client_y - box_.y;
    if x < 0 || y < 0 || x as u32 >= box_.width || y as u32 >= box_.height {
        return None;
    }
    let vx = (x as u64 * video_w as u64 / box_.width as u64) as u32;
    let vy = (y as u64 * video_h as u64 / box_.height as u64) as u32;
    Some((
        vx.min(video_w.saturating_sub(1)),
        vy.min(video_h.saturating_sub(1)),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contain_matches_js_portrait() {
        let (x, y, w, h) = contain_in_zone(900, 950, 1088, 2400);
        assert_eq!((x, y, w, h), (234, 0, 431, 950));
    }

    #[test]
    fn contain_fills_when_no_video() {
        assert_eq!(contain_in_zone(800, 600, 0, 0), (0, 0, 800, 600));
    }

    #[test]
    fn contain_hugs_portrait_in_avail() {
        let (x, y, w, h) = contain_in_zone(912, 955, 1088, 2400);
        assert!(w < 912);
        assert_eq!(y, 0);
        assert!(x > 0);
        assert_eq!(h, 955);
    }

    #[test]
    fn contain_hugs_cet_avail_946x989() {
        let (x, y, w, h) = contain_in_zone(946, 989, 1088, 2400);
        assert_eq!((x, y, w, h), (249, 0, 448, 989));
    }

    #[test]
    fn contain_edge60_native_in_avail() {
        let (x, y, w, h) = contain_in_zone(1008, 991, 1220, 2712);
        assert_eq!(y, 0);
        assert_eq!(h, 991);
        assert!(w < 1008);
        assert!(x > 0);
        let ratio = w as f64 / h as f64;
        assert!((ratio - 1220.0 / 2712.0).abs() < 0.02);
    }

    #[test]
    fn dest_uses_contain_pixels_not_integer_third() {
        let d = present_dest(1008, 991, 1220, 2712);
        assert_eq!((d.width, d.height), (446, 991));
        assert_eq!((d.crop_w, d.crop_h), (1220, 2712));
        assert!(!d.nearest);
        assert!(d.width > 406);
    }

    #[test]
    fn dest_identity_is_nearest() {
        let d = present_dest(2000, 2800, 1220, 2712);
        assert_eq!((d.width, d.height), (1220, 2712));
        assert!(d.nearest);
    }

    #[test]
    fn dest_integer_enlarge_is_nearest() {
        let d = present_dest(400, 800, 100, 200);
        assert_eq!((d.width, d.height), (400, 800));
        assert!(d.nearest);
    }

    #[test]
    fn shrink_uses_area_kernel() {
        let d = present_dest(1008, 991, 1220, 2712);
        assert_eq!(scale_kernel(1220, 2712, d), ScaleKernel::Area);
    }

    #[test]
    fn identity_uses_nearest_kernel() {
        let d = present_dest(2000, 2800, 1220, 2712);
        assert_eq!(scale_kernel(1220, 2712, d), ScaleKernel::Nearest);
    }

    #[test]
    fn content_source_crops_alignment_pad() {
        assert_eq!(content_source_size(1220, 2712, 1248, 2720), (1220, 2712));
    }

    #[test]
    fn maps_inside_letterbox() {
        let box_ = Letterbox {
            x: 10,
            y: 20,
            width: 100,
            height: 200,
            nearest: true,
            crop_w: 50,
            crop_h: 100,
        };
        assert_eq!(map_client_to_video(10, 20, box_, 50, 100), Some((0, 0)));
        assert_eq!(map_client_to_video(0, 0, box_, 50, 100), None);
    }

    #[test]
    fn occupancy_duration_is_spatial_panel() {
        let rows: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../core/yohu-motion/testdata/motion_spec.json"
        ))
        .expect("fixture");
        let ms = rows["spatialPanel"]["durationMs"]
            .as_u64()
            .expect("spatialPanel.durationMs");
        assert_eq!(yohu_motion::MotionSpec::SpatialPanel.duration_ms(), ms);
    }
}
