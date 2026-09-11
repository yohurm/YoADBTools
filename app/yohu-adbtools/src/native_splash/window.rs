//! 启动小窗 HWND：注册类、创建、圆角、消息泵、销毁。

use std::sync::Mutex;

use tauri::window::Color;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::RECT;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    CreateRoundRectRgn, DeleteObject, GetDC, InvalidateRect, ReleaseDC, SetWindowRgn, UpdateWindow,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, GetWindowLongPtrW, GetWindowRect, LoadCursorW,
    PostMessageW, RegisterClassExW, SetWindowLongPtrW, SetWindowPos, ShowWindow, CS_HREDRAW,
    CS_VREDRAW, GWLP_USERDATA, HWND_TOPMOST, IDC_ARROW, SWP_NOZORDER, SW_HIDE, SW_SHOWNORMAL,
    WM_CLOSE, WM_DESTROY, WM_ERASEBKGND, WM_PAINT, WNDCLASSEXW, WS_EX_COMPOSITED, WS_EX_TOOLWINDOW,
    WS_EX_TOPMOST, WS_POPUP,
};
use yohu_protocol::DISPLAY_NAME;

use super::geometry::{
    primary_monitor, scale_px, store_geometry, SplashPlacement, BRAND_GAP_LOGICAL, CORNER_LOGICAL,
    FONT_LOGICAL, ICON_LOGICAL, LOGICAL_H, LOGICAL_W, USER_DEFAULT_SCREEN_DPI,
};
use super::icon::{create_bitmap, load_icon, scale_bitmap};
use super::paint::{paint, PaintData};
use crate::window_boot::{canvas_color, elapsed_ms};

const CLASS: PCWSTR = w!("YohuBootSplash");

static SPLASH_HWND: Mutex<Option<isize>> = Mutex::new(None);

pub fn show(dark: bool) {
    if let Err(e) = show_inner(dark) {
        eprintln!("原生启动小窗失败: {e}");
    }
}

pub fn hide() {
    let Some(hwnd) = splash_hwnd() else {
        return;
    };
    unsafe {
        let _ = ShowWindow(hwnd, SW_HIDE);
    }
}

pub fn close() {
    let hwnd = SPLASH_HWND.lock().unwrap_or_else(|p| p.into_inner()).take();
    let Some(raw) = hwnd else {
        return;
    };
    unsafe {
        let _ = PostMessageW(Some(HWND(raw as *mut _)), WM_CLOSE, WPARAM(0), LPARAM(0));
    }
    tracing::info!(ms = elapsed_ms(), "原生启动小窗已关闭");
}

pub fn splash_hwnd() -> Option<HWND> {
    SPLASH_HWND
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .map(|raw| HWND(raw as *mut _))
}

pub fn splash_window_rect() -> Option<RECT> {
    let hwnd = splash_hwnd()?;
    unsafe {
        let mut r = RECT::default();
        GetWindowRect(hwnd, &mut r).ok()?;
        Some(r)
    }
}

fn show_inner(dark: bool) -> Result<(), String> {
    let icon = load_icon().ok_or_else(|| "解码启动图标失败".to_string())?;
    let Color(cr, cg, cb, _) = canvas_color(dark);
    let icon = icon.onto_canvas(cr, cg, cb);
    unsafe {
        let hinstance = GetModuleHandleW(None).map_err(|e| e.to_string())?;
        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wnd_proc),
            hInstance: hinstance.into(),
            hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
            lpszClassName: CLASS,
            ..Default::default()
        };
        let _ = RegisterClassExW(&wc);

        let screen_dc = GetDC(None);
        let (work, dpi) = primary_monitor();
        let mut title: Vec<u16> = DISPLAY_NAME.encode_utf16().chain([0]).collect();
        let placement = SplashPlacement::from_work(
            work,
            scale_px(LOGICAL_W, dpi),
            scale_px(LOGICAL_H, dpi),
            dpi,
            dark,
        );

        let hwnd = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_COMPOSITED,
            CLASS,
            PCWSTR(title.as_mut_ptr()),
            WS_POPUP,
            placement.x,
            placement.y,
            placement.width,
            placement.height,
            None,
            None,
            Some(hinstance.into()),
            None,
        )
        .map_err(|e| e.to_string())?;

        // MSDN Direct2D：HWND 建好后用窗口自己的 DPI 再 MulDiv，不能信创建前的 96。
        // 工作区仍用创建前锁定的主屏，避免二次选屏把主窗送到另一块显示器。
        let hwnd_dpi = GetDpiForWindow(hwnd);
        let dpi = if hwnd_dpi >= USER_DEFAULT_SCREEN_DPI {
            hwnd_dpi
        } else {
            dpi
        };
        let placement = SplashPlacement::from_work(
            work,
            scale_px(LOGICAL_W, dpi),
            scale_px(LOGICAL_H, dpi),
            dpi,
            dark,
        );
        store_geometry(placement);
        let radius = scale_px(CORNER_LOGICAL, dpi);
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            placement.x,
            placement.y,
            placement.width,
            placement.height,
            SWP_NOZORDER,
        );

        let rgn = CreateRoundRectRgn(
            0,
            0,
            placement.width + 1,
            placement.height + 1,
            radius,
            radius,
        );
        let _ = SetWindowRgn(hwnd, Some(rgn), true);

        let full = create_bitmap(screen_dc, &icon)?;
        let icon_px = scale_px(ICON_LOGICAL, dpi);
        let bitmap = scale_bitmap(
            screen_dc,
            full,
            icon.width as i32,
            icon.height as i32,
            icon_px,
            icon_px,
        )?;
        let _ = DeleteObject(full.into());
        ReleaseDC(None, screen_dc);

        let data = Box::new(PaintData {
            bitmap,
            image_w: icon_px,
            image_h: icon_px,
            icon_px,
            gap_px: scale_px(BRAND_GAP_LOGICAL, dpi),
            font_px: scale_px(FONT_LOGICAL, dpi),
        });
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, Box::into_raw(data) as isize);

        let _ = ShowWindow(hwnd, SW_SHOWNORMAL);
        let _ = InvalidateRect(Some(hwnd), None, true);
        let _ = UpdateWindow(hwnd);
        yohu_motion::pump(hwnd);

        *SPLASH_HWND.lock().unwrap_or_else(|p| p.into_inner()) = Some(hwnd.0 as isize);
        Ok(())
    }
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_ERASEBKGND => LRESULT(1),
        WM_PAINT => {
            paint(hwnd);
            LRESULT(0)
        }
        WM_CLOSE | WM_DESTROY => {
            unsafe {
                let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut PaintData;
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
                if !ptr.is_null() {
                    let data = Box::from_raw(ptr);
                    let _ = DeleteObject(data.bitmap.into());
                }
                if msg == WM_CLOSE {
                    let _ = DestroyWindow(hwnd);
                }
            }
            let mut slot = SPLASH_HWND.lock().unwrap_or_else(|p| p.into_inner());
            if slot.map(|h| h == hwnd.0 as isize).unwrap_or(false) {
                *slot = None;
            }
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}
