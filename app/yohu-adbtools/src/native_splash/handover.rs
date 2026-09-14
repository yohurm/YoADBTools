//! L4：hydrate 之后消费本模块交接表面。
//! 主窗 HWND 一次落到最终矩形。禁止插值 HWND 宽高。
//! 主窗内容只在 overlay 铺满（同屏）或出场结束（异屏）之后才变为可见。

use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowRect, IsWindowVisible, SetWindowPos, ShowWindow, HWND_TOP, SWP_NOACTIVATE,
    SWP_NOZORDER, SWP_SHOWWINDOW, SW_SHOWNOACTIVATE,
};

use crate::tokens::{WINDOW_DEFAULT_H, WINDOW_DEFAULT_W};
use crate::window_boot::elapsed_ms;

use super::geometry::{
    center_in_work_area, clamp_rect_min, classify_handover, last_geometry, rect_height, rect_width,
    xywh, HandoverKind, LOGICAL_H, LOGICAL_W, WINDOW_MIN_H, WINDOW_MIN_W,
};
use super::recipe;
use super::surface::BootSurface;
use super::window::{frame_snapshot, splash_hwnd, splash_window_rect};

/// 揭窗单一入口调用。已可见则关小窗返回。
pub fn to_main(main: HWND) {
    if is_window_visible(main) {
        super::close();
        return;
    }

    let Some(splash) = splash_hwnd() else {
        show_main_at_target(main, fallback_target(main));
        finish();
        return;
    };
    let splash_rect = splash_window_rect().unwrap_or_else(|| {
        last_geometry()
            .map(|g| g.rect())
            .unwrap_or_else(|| xywh(0, 0, LOGICAL_W, LOGICAL_H))
    });
    let main_rect = window_rect(main).unwrap_or(splash_rect);
    let Some(placement) = last_geometry() else {
        show_main_at_target(main, target_on_splash_work(main_rect));
        finish();
        return;
    };
    let kind = classify_handover(splash_rect, main_rect, placement.work());
    let target = target_on_splash_work(main_rect);

    if !yohu_motion::motion_allowed() {
        tracing::info!(ms = elapsed_ms(), ?kind, "系统关闭窗口动画，瞬时交接");
        show_main_at_target(main, target);
        finish();
        return;
    }

    tracing::info!(
        ms = elapsed_ms(),
        ?kind,
        splash_w = rect_width(splash_rect),
        splash_h = rect_height(splash_rect),
        target_w = rect_width(target),
        target_h = rect_height(target),
        splash_r = placement.corner,
        host_r = placement.host_corner(),
        clip_to = match kind {
            HandoverKind::SameScreen => 0,
            HandoverKind::CrossScreen => placement.corner,
        },
        "启动交接几何"
    );

    place_main_at_target(main, target);
    let Some(frame) = frame_snapshot() else {
        tracing::info!(ms = elapsed_ms(), "启动交接：无表面，瞬时");
        show_main_at_target(main, target);
        finish();
        return;
    };
    let surface = BootSurface::lock(placement, frame);
    let cover = || {
        tracing::info!(ms = elapsed_ms(), "启动交接：overlay 已盖住，藏小窗");
        super::hide();
    };
    let present = || {
        tracing::info!(ms = elapsed_ms(), "启动交接：揭主窗内容");
        present_main(main);
    };

    match kind {
        HandoverKind::SameScreen => {
            tracing::info!(ms = elapsed_ms(), "启动交接：同屏共享容器");
            recipe::same_screen(surface, splash_rect, target, splash, cover, present);
        }
        HandoverKind::CrossScreen => {
            tracing::info!(ms = elapsed_ms(), "启动交接：异屏出场");
            recipe::cross_screen(surface, splash_rect, splash, cover, present);
        }
    }
    finish();
}

fn finish() {
    super::close();
}

fn target_on_splash_work(main_size_src: RECT) -> RECT {
    let sized = clamp_rect_min(main_size_src, WINDOW_MIN_W, WINDOW_MIN_H);
    let w = rect_width(sized);
    let h = rect_height(sized);
    match last_geometry() {
        Some(g) => {
            let (x, y) = center_in_work_area(g.work(), w, h);
            xywh(x, y, w, h)
        }
        None => xywh(main_size_src.left, main_size_src.top, w, h),
    }
}

fn fallback_target(main: HWND) -> RECT {
    window_rect(main)
        .map(target_on_splash_work)
        .unwrap_or_else(|| xywh(0, 0, WINDOW_DEFAULT_W as i32, WINDOW_DEFAULT_H as i32))
}

fn place_main_at_target(main: HWND, target: RECT) {
    unsafe {
        let _ = SetWindowPos(
            main,
            Some(HWND_TOP),
            target.left,
            target.top,
            rect_width(target).max(1),
            rect_height(target).max(1),
            SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
}

fn present_main(main: HWND) {
    unsafe {
        let _ = ShowWindow(main, SW_SHOWNOACTIVATE);
    }
}

fn show_main_at_target(main: HWND, target: RECT) {
    let flags = SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW;
    unsafe {
        let _ = SetWindowPos(
            main,
            Some(HWND_TOP),
            target.left,
            target.top,
            rect_width(target).max(1),
            rect_height(target).max(1),
            flags,
        );
    }
}

fn window_rect(hwnd: HWND) -> Option<RECT> {
    unsafe {
        let mut r = RECT::default();
        GetWindowRect(hwnd, &mut r).ok()?;
        Some(r)
    }
}

fn is_window_visible(hwnd: HWND) -> bool {
    unsafe { IsWindowVisible(hwnd).as_bool() }
}
