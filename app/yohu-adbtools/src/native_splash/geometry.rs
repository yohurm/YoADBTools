//! 启动小窗几何：逻辑尺寸、Per-Monitor V2 缩放、主屏工作区居中。

use std::sync::Mutex;

use windows::Win32::Foundation::{POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromPoint, HMONITOR, MONITORINFO, MONITOR_DEFAULTTOPRIMARY,
};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};

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

pub const LOGICAL_W: i32 = 480;
pub const LOGICAL_H: i32 = 300;
pub const ICON_LOGICAL: i32 = 72;
pub const BRAND_GAP_LOGICAL: i32 = crate::tokens::SPACE_LG;
pub const FONT_LOGICAL: i32 = crate::tokens::FONT_PAGE_TITLE;
/// 与 `@yohu/ui` `Radius.Md` 同值。小窗外形 / overlay 起势 clip。
pub const CORNER_LOGICAL: i32 = crate::tokens::RADIUS_MD;
/// 与 `@yohu/ui` `Radius.Sm` 同值。Win11 主窗外框 DWM round ≈ 8vp。
pub const HOST_CORNER_LOGICAL: i32 = crate::tokens::RADIUS_SM;
pub const USER_DEFAULT_SCREEN_DPI: u32 = 96;
/// GetMonitorInfo 失败时的假工作区。不是 `Layout.WindowDefaultW/H`。
const FALLBACK_WORK_W: i32 = 1920;
const FALLBACK_WORK_H: i32 = 1080;

/// 启动会话：几何 + 主题 + 圆角半径。小窗 / 主窗 / overlay 只读这一份。
#[derive(Clone, Copy, Debug)]
pub struct SplashPlacement {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub dpi: u32,
    pub dark: bool,
    /// 物理像素。由 `CORNER_LOGICAL` × DPI 锁定，不是绘制后再量。
    pub corner: i32,
    pub work_left: i32,
    pub work_top: i32,
    pub work_right: i32,
    pub work_bottom: i32,
}

impl SplashPlacement {
    pub fn from_work(work: RECT, width: i32, height: i32, dpi: u32, dark: bool) -> Self {
        let (x, y) = center_in_work_area(work, width, height);
        Self {
            x,
            y,
            width,
            height,
            dpi,
            dark,
            corner: scale_px(CORNER_LOGICAL, dpi),
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

    pub fn host_corner(&self) -> i32 {
        scale_px(HOST_CORNER_LOGICAL, self.dpi)
    }

    /// GDI `CreateRoundRectRgn` 的椭圆宽高是直径，不是半径。
    pub fn gdi_ellipse(&self) -> i32 {
        self.corner.saturating_mul(2).max(1)
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
pub const WINDOW_MIN_W: i32 = crate::tokens::WINDOW_MIN_W;
pub const WINDOW_MIN_H: i32 = crate::tokens::WINDOW_MIN_H;

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

/// 在工作区矩形内居中（避开任务栏）。
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

/// 主屏工作区 + 有效 DPI。主屏原点恒为 (0, 0)（MSDN Multiple Display Monitors）。
/// 禁止 `SM_CXSCREEN`（那是虚拟屏，不是主屏工作区）。
pub fn primary_monitor() -> (RECT, u32) {
    unsafe {
        let mon = MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
        monitor_work_dpi(mon)
    }
}

fn monitor_work_dpi(mon: HMONITOR) -> (RECT, u32) {
    unsafe {
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

/// 主窗与小窗共用这块启动工作区。小窗没记下时回退到当前主屏。
pub fn center_on_splash_work(w: i32, h: i32) -> (i32, i32) {
    match last_geometry() {
        Some(g) => center_in_work_area(g.work(), w, h),
        None => {
            let (work, _) = primary_monitor();
            center_in_work_area(work, w, h)
        }
    }
}

pub fn last_geometry() -> Option<SplashPlacement> {
    *LAST_GEOMETRY.lock().unwrap_or_else(|p| p.into_inner())
}

/// 小窗锁定的主题。绘制 / overlay 填色只问这里，不另存一份。
pub fn boot_dark() -> bool {
    last_geometry().map(|g| g.dark).unwrap_or(false)
}

pub(super) fn store_geometry(placement: SplashPlacement) {
    *LAST_GEOMETRY.lock().unwrap_or_else(|p| p.into_inner()) = Some(placement);
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

    #[test]
    fn splash_is_smaller_than_main() {
        const {
            assert!(LOGICAL_W < WINDOW_MIN_W);
            assert!(LOGICAL_H < WINDOW_MIN_H);
        }
    }

    #[test]
    fn primary_monitor_has_positive_work_area() {
        let (work, dpi) = primary_monitor();
        assert!(dpi >= USER_DEFAULT_SCREEN_DPI);
        assert!(rect_width(work) > 0);
        assert!(rect_height(work) > 0);
        assert!(work.right > work.left);
        assert!(work.bottom > work.top);
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
        store_geometry(SplashPlacement::from_work(work, 840, 525, 168, false));
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

    #[test]
    fn boot_dark_matches_stored_placement() {
        let work = RECT {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        };
        store_geometry(SplashPlacement::from_work(work, 480, 300, 96, false));
        assert!(!boot_dark());
        store_geometry(SplashPlacement::from_work(work, 480, 300, 96, true));
        assert!(boot_dark());
    }

    #[test]
    fn corner_tokens_match_youi_radius() {
        assert_eq!(CORNER_LOGICAL, 16);
        assert_eq!(HOST_CORNER_LOGICAL, 8);
        assert_eq!(BRAND_GAP_LOGICAL, crate::tokens::SPACE_LG);
    }

    #[test]
    fn placement_locks_corner_with_dpi() {
        let work = RECT {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        };
        let splash = SplashPlacement::from_work(work, 480, 300, 96, false);
        assert_eq!(splash.corner, 16);
        assert_eq!(splash.host_corner(), 8);
        assert_eq!(splash.gdi_ellipse(), 32);
        let scaled = SplashPlacement::from_work(work, 840, 525, 168, false);
        assert_eq!(scaled.corner, 28);
        assert_eq!(scaled.host_corner(), 14);
    }
}
