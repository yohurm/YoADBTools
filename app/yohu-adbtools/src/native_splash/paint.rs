//! 启动小窗客户区绘制：底色、居中品牌栈（图标 + 标题）。

use tauri::window::Color;
use windows::Win32::Foundation::{COLORREF, HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, CreateCompatibleDC, CreateFontW, CreateSolidBrush, DeleteDC, DeleteObject,
    DrawTextW, EndPaint, FillRect, SelectObject, SetBkMode, SetStretchBltMode, SetTextColor,
    StretchBlt, CLIP_DEFAULT_PRECIS, DEFAULT_CHARSET, DEFAULT_QUALITY, DT_CALCRECT, DT_CENTER,
    DT_NOPREFIX, DT_SINGLELINE, FF_DONTCARE, FW_SEMIBOLD, HALFTONE, HBITMAP, OUT_DEFAULT_PRECIS,
    PAINTSTRUCT, SRCCOPY, TRANSPARENT,
};
use windows::Win32::UI::WindowsAndMessaging::{GetClientRect, GetWindowLongPtrW, GWLP_USERDATA};
use yohu_protocol::DISPLAY_NAME;

use crate::window_boot::{brand_text_color, canvas_color};

use super::geometry::{BRAND_GAP_LOGICAL, FONT_LOGICAL, ICON_LOGICAL, LOGICAL_W};

pub struct PaintData {
    pub bitmap: HBITMAP,
    pub image_w: i32,
    pub image_h: i32,
    pub dark: bool,
}

/// 图标 + 间距 + 标题作为一组，在客户区水平、垂直居中。
pub fn brand_origin(client_w: i32, client_h: i32, icon: i32, gap: i32, text_h: i32) -> (i32, i32) {
    let stack_h = icon + gap + text_h;
    let x = (client_w - icon) / 2;
    let y = (client_h - stack_h) / 2;
    (x.max(0), y.max(0))
}

fn to_colorref(Color(r, g, b, _): Color) -> COLORREF {
    COLORREF(u32::from(b) | (u32::from(g) << 8) | (u32::from(r) << 16))
}

pub fn paint(hwnd: HWND) {
    unsafe {
        let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *const PaintData;
        let mut ps = PAINTSTRUCT::default();
        let hdc = BeginPaint(hwnd, &mut ps);
        if ptr.is_null() {
            let _ = EndPaint(hwnd, &ps);
            return;
        }
        let data = &*ptr;
        let mut client = RECT::default();
        let _ = GetClientRect(hwnd, &mut client);
        let w = (client.right - client.left).max(1);
        let h = (client.bottom - client.top).max(1);
        let bg = to_colorref(canvas_color(data.dark));
        let brush = CreateSolidBrush(bg);
        FillRect(hdc, &client, brush);
        let _ = DeleteObject(brush.into());

        let icon = (ICON_LOGICAL * w) / LOGICAL_W;
        let gap = (BRAND_GAP_LOGICAL * w) / LOGICAL_W;
        let font_px = (FONT_LOGICAL * w) / LOGICAL_W;
        let mem = CreateCompatibleDC(Some(hdc));
        let old = SelectObject(mem, data.bitmap.into());
        let _ = SetStretchBltMode(hdc, HALFTONE);

        let font = CreateFontW(
            -font_px,
            0,
            0,
            0,
            FW_SEMIBOLD.0 as i32,
            0,
            0,
            0,
            DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS,
            CLIP_DEFAULT_PRECIS,
            DEFAULT_QUALITY,
            FF_DONTCARE.0 as u32,
            windows::core::w!("Segoe UI"),
        );
        let old_font = SelectObject(hdc, font.into());
        SetBkMode(hdc, TRANSPARENT);
        let mut text: Vec<u16> = DISPLAY_NAME.encode_utf16().collect();
        let mut measure = RECT {
            left: 0,
            top: 0,
            right: w,
            bottom: 0,
        };
        let text_h = DrawTextW(
            hdc,
            &mut text,
            &mut measure,
            DT_CALCRECT | DT_CENTER | DT_SINGLELINE | DT_NOPREFIX,
        )
        .max(font_px);
        let (icon_x, icon_y) = brand_origin(w, h, icon, gap, text_h);
        let _ = StretchBlt(
            hdc,
            icon_x,
            icon_y,
            icon,
            icon,
            Some(mem),
            0,
            0,
            data.image_w,
            data.image_h,
            SRCCOPY,
        );
        SelectObject(mem, old);
        let _ = DeleteDC(mem);

        SetTextColor(hdc, to_colorref(brand_text_color(data.dark)));
        let mut text_rect = RECT {
            left: 0,
            top: icon_y + icon + gap,
            right: w,
            bottom: icon_y + icon + gap + text_h,
        };
        let _ = DrawTextW(
            hdc,
            &mut text,
            &mut text_rect,
            DT_CENTER | DT_SINGLELINE | DT_NOPREFIX,
        );
        SelectObject(hdc, old_font);
        let _ = DeleteObject(font.into());
        let _ = EndPaint(hwnd, &ps);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn brand_stack_is_centered_in_splash() {
        let (x, y) = brand_origin(480, 300, 72, 16, 23);
        assert_eq!(x, 204);
        assert_eq!(y, 94);
        let stack_h = 72 + 16 + 23;
        assert_eq!(y + stack_h, 205);
        assert_eq!(300 - (y + stack_h), 95);
        assert!((y - (300 - y - stack_h)).abs() <= 1);
    }
}
