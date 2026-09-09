//! 启动小窗几何：逻辑尺寸、Per-Monitor V2 缩放、光标屏工作区居中。

use std::sync::Mutex;

use windows::Win32::Foundation::{POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

pub(crate) use yohu_motion::{rect_center, rect_height, rect_width, xywh};

pub const LOGICAL_W: i32 = 480;
pub const LOGICAL_H: i32 = 300;
pub const ICON_LOGICAL: i32 = 72;
pub const BRAND_GAP_LOGICAL: i32 = 16;
pub const FONT_LOGICAL: i32 = 18;
pub const CORNER_LOGICAL: i32 = 16;
pub const USER_DEFAULT_SCREEN_DPI: u32 = 96;
/// GetMonitorInfo 失败时的假工作区。不是 `Layout.WindowDefaultW/H`。
const FALLBACK_WORK_W: i32 = 1920;
const FALLBACK_WORK_H: i32 = 1080;

/// 小窗物理几何 + 当时锁定的工作区。主窗居中只读这份工作区，不再重新 GetCursorPos。
#[derive(Clone, Copy, Debug)]
pub struct SplashPlacement {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub dpi: u32,
    pub work_left: i32,
    pub work_top: i32,
    pub work_right: i32,
    pub work_bottom: i32,
}

impl SplashPlacement {
    pub fn from_work(work: RECT, width: i32, height: i32, dpi: u32) -> Self {
        let (x, y) = center_in_work_area(work, width, height);
        Self {
            x,
            y,
            width,
            height,
            dpi,
            work_left: work.left,
            work_top: work.top,
            work_right: work.right,
            work_bottom: work.bottom,
        }
    }

    pub fn work(&self) -> RECT {
        RECT {
            left: self.work_left,
            top: self.work_top,
            right: self.work_right,
            bottom: self.work_bottom,
        }
    }

    pub fn rect(&self) -> RECT {
        xywh(self.x, self.y, self.width, self.height)
    }
}

/// 同屏共享容器 / 异屏出场。分类只看两窗中心是否落在小窗锁定的工作区。
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HandoverKind {
    SameScreen,
    CrossScreen,
}

pub fn point_in_rect(x: i32, y: i32, r: RECT) -> bool {
    x >= r.left && x < r.right && y >= r.top && y < r.bottom
}

/// 与 `@yohu/ui` `Layout.WindowMinW/H` 同值。
pub const WINDOW_MIN_W: i32 = 1024;
pub const WINDOW_MIN_H: i32 = 768;

pub fn clamp_rect_min(r: RECT, min_w: i32, min_h: i32) -> RECT {
    let (cx, cy) = rect_center(r);
    let w = rect_width(r).max(min_w);
    let h = rect_height(r).max(min_h);
    xywh(cx - w / 2, cy - h / 2, w, h)
}

/// 两窗中心都在小窗锁定的工作区内 → 同屏共享容器。
pub fn classify_handover(splash: RECT, main: RECT, splash_work: RECT) -> HandoverKind {
    if point_in_rect(rect_center(splash).0, rect_center(splash).1, splash_work)
        && point_in_rect(rect_center(main).0, rect_center(main).1, splash_work)
    {
        HandoverKind::SameScreen
    } else {
        HandoverKind::CrossScreen
    }
}

static LAST_GEOMETRY: Mutex<Option<SplashPlacement>> = Mutex::new(None);

/// 在工作区矩形内居中（跟 Android Studio 一样：光标所在屏，避开任务栏）。
pub fn center_in_work_area(work: RECT, w: i32, h: i32) -> (i32, i32) {
    let x = work.left + (work.right - work.left - w) / 2;
    let y = work.top + (work.bottom - work.top - h) / 2;
    (x, y)
}

/// Per-Monitor V2 下 GDI 不会自动缩放（MSDN / tao `dpi.rs`）：
/// `MulDiv(logical, dpi, 96)`。禁止 `dpi / 96` 整数截断（168/96 = 1）。
pub fn scale_px(logical: i32, dpi: u32) -> i32 {
    let dpi = dpi.max(USER_DEFAULT_SCREEN_DPI);
    (logical as i64 * i64::from(dpi) / i64::from(USER_DEFAULT_SCREEN_DPI)) as i32
}

pub fn cursor_monitor() -> (RECT, u32) {
    unsafe {
        let mut pt = POINT::default();
        let _ = GetCursorPos(&mut pt);
        let mon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
        let mut dpi_x = USER_DEFAULT_SCREEN_DPI;
        let mut dpi_y = USER_DEFAULT_SCREEN_DPI;
        let _ = GetDpiForMonitor(mon, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);
        let dpi = dpi_x.max(USER_DEFAULT_SCREEN_DPI);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        let work = if GetMonitorInfoW(mon, &mut mi).as_bool() {
            mi.rcWork
        } else {
            RECT {
                left: 0,
                top: 0,
                right: FALLBACK_WORK_W,
                bottom: FALLBACK_WORK_H,
            }
        };
        (work, dpi)
    }
}

fn center_on_cursor(w: i32, h: i32) -> (i32, i32) {
    let (work, _) = cursor_monitor();
    center_in_work_area(work, w, h)
}

/// 主窗跟小窗用同一块工作区。小窗没记下时才回退到当前光标屏。
pub fn center_on_splash_work(w: i32, h: i32) -> (i32, i32) {
    match last_geometry() {
        Some(g) => center_in_work_area(g.work(), w, h),
        None => center_on_cursor(w, h),
    }
}

pub fn last_geometry() -> Option<SplashPlacement> {
    *LAST_GEOMETRY.lock().unwrap_or_else(|p| p.into_inner())
}

pub(super) fn store_geometry(placement: SplashPlacement) {
    *LAST_GEOMETRY.lock().unwrap_or_else(|p| p.into_inner()) = Some(placement);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splash_is_smaller_than_main() {
        const {
            assert!(LOGICAL_W < WINDOW_MIN_W);
            assert!(LOGICAL_H < WINDOW_MIN_H);
        }
    }

    #[test]
    fn scale_px_follows_msdn_muldiv() {
        assert_eq!(scale_px(480, 96), 480);
        assert_eq!(scale_px(480, 144), 720);
        assert_eq!(scale_px(480, 168), 840);
        assert_eq!(scale_px(300, 168), 525);
        assert_eq!(scale_px(72, 168), 126);
    }

    #[test]
    fn center_follows_secondary_work_area() {
        let work = RECT {
            left: 1493,
            top: 0,
            right: 3687,
            bottom: 1186,
        };
        let (x, y) = center_in_work_area(work, 480, 300);
        assert_eq!(x, 2350);
        assert_eq!(y, 443);
        assert!(x > work.left);
        assert!(x + 480 < work.right);
    }

    #[test]
    fn main_window_reuses_splash_work_area() {
        let work = RECT {
            left: 1493,
            top: 0,
            right: 3687,
            bottom: 1186,
        };
        store_geometry(SplashPlacement::from_work(work, 840, 525, 168));
        let (x, y) = center_on_splash_work(1200, 800);
        assert_eq!((x, y), center_in_work_area(work, 1200, 800));
        assert_eq!(x, 1990);
        assert_eq!(y, 193);
    }

    #[test]
    fn same_work_area_is_same_screen() {
        let work = RECT {
            left: 1493,
            top: 0,
            right: 3687,
            bottom: 1186,
        };
        let splash = xywh(2350, 443, 480, 300);
        let main = xywh(1990, 193, 1200, 800);
        assert_eq!(
            classify_handover(splash, main, work),
            HandoverKind::SameScreen
        );
    }

    #[test]
    fn other_monitor_is_cross_handover() {
        let splash_work = RECT {
            left: 1493,
            top: 0,
            right: 3687,
            bottom: 1186,
        };
        let splash = xywh(2350, 443, 480, 300);
        let main_on_primary = xywh(360, 140, 1200, 800);
        assert_eq!(
            classify_handover(splash, main_on_primary, splash_work),
            HandoverKind::CrossScreen
        );
    }

    #[test]
    fn clamp_matches_window_min() {
        let clamped = clamp_rect_min(xywh(0, 0, 400, 300), WINDOW_MIN_W, WINDOW_MIN_H);
        assert_eq!(rect_width(clamped), WINDOW_MIN_W);
        assert_eq!(rect_height(clamped), WINDOW_MIN_H);
    }
}
