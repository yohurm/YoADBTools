//! 屏幕矩形算术。不含 overlay dest、不含占用 clip。

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn center_is_midpoint() {
        let r = xywh(100, 50, 480, 300);
        assert_eq!(rect_center(r), (340, 200));
        assert_eq!(rect_width(r), 480);
        assert_eq!(rect_height(r), 300);
    }
}
