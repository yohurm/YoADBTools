//! L2 视觉几何：overlay 客户区里的 dest 矩形。不是 HWND 布局。

use windows::Win32::Foundation::RECT;

pub fn xywh(x: i32, y: i32, w: i32, h: i32) -> RECT {
    RECT {
        left: x,
        top: y,
        right: x + w,
        bottom: y + h,
    }
}

pub fn rect_width(r: RECT) -> i32 {
    r.right - r.left
}

pub fn rect_height(r: RECT) -> i32 {
    r.bottom - r.top
}

pub fn rect_center(r: RECT) -> (i32, i32) {
    (r.left + rect_width(r) / 2, r.top + rect_height(r) / 2)
}

pub fn scale_rect_about_center(r: RECT, scale: f64) -> RECT {
    let (cx, cy) = rect_center(r);
    let w = ((f64::from(rect_width(r)) * scale).round() as i32).max(1);
    let h = ((f64::from(rect_height(r)) * scale).round() as i32).max(1);
    xywh(cx - w / 2, cy - h / 2, w, h)
}

pub fn screen_to_client(overlay: RECT, screen: RECT) -> RECT {
    RECT {
        left: screen.left - overlay.left,
        top: screen.top - overlay.top,
        right: screen.right - overlay.left,
        bottom: screen.bottom - overlay.top,
    }
}

/// dest 在 overlay 客户区；content 是快照像素。DComp Visual：Offset + Scale（原点左上）。
pub fn visual_pose(dest: RECT, content_w: i32, content_h: i32) -> (f32, f32, f32, f32) {
    let cw = content_w.max(1) as f32;
    let ch = content_h.max(1) as f32;
    (
        dest.left as f32,
        dest.top as f32,
        rect_width(dest).max(1) as f32 / cw,
        rect_height(dest).max(1) as f32 / ch,
    )
}

/// 品牌层保持 1:1，只把中心钉在 dest 中心。
pub fn center_offset(dest: RECT, content_w: i32, content_h: i32) -> (f32, f32) {
    let (cx, cy) = rect_center(dest);
    ((cx - content_w / 2) as f32, (cy - content_h / 2) as f32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scale_keeps_center() {
        let from = xywh(100, 100, 480, 300);
        let (cx, cy) = rect_center(from);
        let shrunk = scale_rect_about_center(from, 0.5);
        assert_eq!(rect_center(shrunk), (cx, cy));
        assert_eq!(rect_width(shrunk), 240);
        assert_eq!(rect_height(shrunk), 150);
    }

    #[test]
    fn shared_center_does_not_walk() {
        let from = xywh(100, 100, 200, 100);
        let to = xywh(0, 50, 400, 200);
        assert_eq!(rect_center(from), (200, 150));
        assert_eq!(rect_center(to), (200, 150));
        assert_eq!(center_offset(from, 480, 300), center_offset(to, 480, 300));
        assert_eq!(center_offset(from, 480, 300), (-40.0, 0.0));
    }

    #[test]
    fn splash_rect_maps_into_overlay_client() {
        let target = xywh(100, 50, 1200, 800);
        let splash = xywh(500, 300, 480, 300);
        let c = screen_to_client(target, splash);
        assert_eq!(c.left, 400);
        assert_eq!(c.top, 250);
        assert_eq!(c.right, 880);
        assert_eq!(c.bottom, 550);
    }

    #[test]
    fn pose_is_offset_and_scale_not_hwnd() {
        let dest = xywh(400, 250, 480, 300);
        let (ox, oy, sx, sy) = visual_pose(dest, 480, 300);
        assert_eq!((ox, oy), (400.0, 250.0));
        assert!((sx - 1.0).abs() < 1e-6 && (sy - 1.0).abs() < 1e-6);
        let fill = xywh(0, 0, 1200, 800);
        let (_, _, fx, fy) = visual_pose(fill, 480, 300);
        assert!((fx - 2.5).abs() < 1e-6);
        assert!((fy - 800.0 / 300.0).abs() < 1e-5);
        let (bx, by) = center_offset(fill, 480, 300);
        assert_eq!((bx, by), (360.0, 250.0));
    }
}
