//! 启动小窗客户区绘制：底色、居中品牌栈（图标 + 标题）。
//! 图标位图须已叠到画布色；本层只 `BitBlt`，不混合 alpha。
//! 交接动画改走冻结快照，本窗尺寸不再插值。

use tauri::window::Color;
use windows::Win32::Foundation::{COLORREF, HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateFontW, CreateSolidBrush,
    DeleteDC, DeleteObject, DrawTextW, EndPaint, FillRect, GetTextMetricsW, SelectObject,
    SetBkMode, SetTextColor, CLIP_DEFAULT_PRECIS, DEFAULT_CHARSET, DEFAULT_QUALITY, DT_CENTER,
    DT_NOPREFIX, DT_SINGLELINE, DT_VCENTER, FF_DONTCARE, FW_SEMIBOLD, HBITMAP, OUT_DEFAULT_PRECIS,
    PAINTSTRUCT, SRCCOPY, TEXTMETRICW, TRANSPARENT,
};
use windows::Win32::UI::WindowsAndMessaging::{GetClientRect, GetWindowLongPtrW, GWLP_USERDATA};
use yohu_protocol::DISPLAY_NAME;

use super::geometry::boot_dark;
use crate::window_boot::{brand_text_color, canvas_color};

pub struct PaintData {
    pub bitmap: HBITMAP,
    pub image_w: i32,
    pub image_h: i32,
    /// 按创建时 DPI 冻结，不随重绘改尺寸。
    pub icon_px: i32,
    pub gap_px: i32,
    pub font_px: i32,
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
        let mem = CreateCompatibleDC(Some(hdc));
        let back = CreateCompatibleBitmap(hdc, w, h);
        let old_back = SelectObject(mem, back.into());
        let dark = boot_dark();
        let bg = to_colorref(canvas_color(dark));
        let brush = CreateSolidBrush(bg);
        FillRect(mem, &client, brush);
        let _ = DeleteObject(brush.into());

        let icon = data.icon_px.max(1);
        let gap = data.gap_px.max(0);
        let font_px = data.font_px.max(1);
        let icon_dc = CreateCompatibleDC(Some(hdc));
        let old_icon = SelectObject(icon_dc, data.bitmap.into());

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
        let old_font = SelectObject(mem, font.into());
        SetBkMode(mem, TRANSPARENT);
        let mut tm = TEXTMETRICW::default();
        let _ = GetTextMetricsW(mem, &mut tm);
        let text_h = tm.tmHeight.max(font_px);
        let mut text: Vec<u16> = DISPLAY_NAME.encode_utf16().collect();
        let (icon_x, icon_y) = brand_origin(w, h, icon, gap, text_h);
        let _ = BitBlt(
            mem,
            icon_x,
            icon_y,
            data.image_w.max(1),
            data.image_h.max(1),
            Some(icon_dc),
            0,
            0,
            SRCCOPY,
        );
        SelectObject(icon_dc, old_icon);
        let _ = DeleteDC(icon_dc);

        SetTextColor(mem, to_colorref(brand_text_color(dark)));
        let mut text_rect = RECT {
            left: 0,
            top: icon_y + icon + gap,
            right: w,
            bottom: icon_y + icon + gap + text_h,
        };
        let _ = DrawTextW(
            mem,
            &mut text,
            &mut text_rect,
            DT_CENTER | DT_SINGLELINE | DT_NOPREFIX | DT_VCENTER,
        );
        SelectObject(mem, old_font);
        let _ = DeleteObject(font.into());
        let _ = BitBlt(hdc, 0, 0, w, h, Some(mem), 0, 0, SRCCOPY);
        SelectObject(mem, old_back);
        let _ = DeleteObject(back.into());
        let _ = DeleteDC(mem);
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
