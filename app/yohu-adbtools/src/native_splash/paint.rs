//! 启动表面绘制：产出不透明矩形 `BootFrame`。
//! 底色只写 `canvas_bgra`；GDI 只画图标和标题，禁止 `FillRect` 整框（会把 BGRA 写成 RGBA）。
//! 本层不 `SetWindowRgn`、不采样 HWND DC。圆角由窗口显示 clip / overlay DComp clip 负责。

use tauri::window::Color;
use windows::Win32::Foundation::{COLORREF, HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, BitBlt, CreateCompatibleDC, CreateDIBSection, CreateFontW, DeleteDC, DeleteObject,
    DrawTextW, EndPaint, GetTextMetricsW, SelectObject, SetBkMode, SetTextColor, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, CLIP_DEFAULT_PRECIS, DEFAULT_CHARSET, DEFAULT_QUALITY, DIB_RGB_COLORS,
    DT_CENTER, DT_NOPREFIX, DT_SINGLELINE, DT_VCENTER, FF_DONTCARE, FW_SEMIBOLD, HBITMAP, HDC,
    OUT_DEFAULT_PRECIS, PAINTSTRUCT, RGBQUAD, SRCCOPY, TEXTMETRICW, TRANSPARENT,
};
use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, GWLP_USERDATA};
use yohu_protocol::DISPLAY_NAME;

use super::geometry::SplashPlacement;
use super::surface::{fill_canvas, force_opaque, BootFrame};
use crate::window_boot::brand_text_color;

/// 一次绘制会话：尺寸与主题来自 `SplashPlacement`，铬尺寸已按 DPI 缩放。
pub struct PaintSpec {
    pub icon_px: i32,
    pub gap_px: i32,
    pub font_px: i32,
    pub frame_w: i32,
    pub frame_h: i32,
    pub dark: bool,
}

impl PaintSpec {
    pub fn from_placement(
        placement: SplashPlacement,
        icon_px: i32,
        gap_px: i32,
        font_px: i32,
    ) -> Self {
        Self {
            icon_px,
            gap_px,
            font_px,
            frame_w: placement.width,
            frame_h: placement.height,
            dark: placement.dark,
        }
    }
}

pub struct PaintData {
    pub bitmap: HBITMAP,
    pub image_w: i32,
    pub image_h: i32,
    pub icon_px: i32,
    pub gap_px: i32,
    pub font_px: i32,
    dark: bool,
    frame: HBITMAP,
    frame_w: i32,
    frame_h: i32,
    frame_bits: *mut u8,
}

impl PaintData {
    pub unsafe fn create(hdc: HDC, icon: HBITMAP, spec: PaintSpec) -> Result<Box<Self>, String> {
        let frame_w = spec.frame_w.max(1);
        let frame_h = spec.frame_h.max(1);
        let (frame, frame_bits) = alloc_dib(hdc, frame_w, frame_h)?;
        let n = (frame_w as usize) * (frame_h as usize) * 4;
        fill_canvas(
            std::slice::from_raw_parts_mut(frame_bits, n),
            crate::window_boot::canvas_bgra(spec.dark),
        );
        let data = Box::new(Self {
            bitmap: icon,
            image_w: spec.icon_px,
            image_h: spec.icon_px,
            icon_px: spec.icon_px,
            gap_px: spec.gap_px,
            font_px: spec.font_px,
            dark: spec.dark,
            frame,
            frame_w,
            frame_h,
            frame_bits,
        });
        data.compose();
        Ok(data)
    }

    pub fn copy_frame(&self) -> Option<BootFrame> {
        if self.frame_bits.is_null() {
            return None;
        }
        let n = (self.frame_w as usize) * (self.frame_h as usize) * 4;
        let bits = unsafe { std::slice::from_raw_parts(self.frame_bits, n) };
        Some(BootFrame::from_dib(bits, self.frame_w, self.frame_h))
    }

    unsafe fn compose(&self) {
        let mem = CreateCompatibleDC(None);
        if mem.is_invalid() {
            return;
        }
        let old = SelectObject(mem, self.frame.into());
        let icon = self.icon_px.max(1);
        let gap = self.gap_px.max(0);
        let font_px = self.font_px.max(1);
        let icon_dc = CreateCompatibleDC(Some(mem));
        let old_icon = SelectObject(icon_dc, self.bitmap.into());
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
        let (icon_x, icon_y) = brand_origin(self.frame_w, self.frame_h, icon, gap, text_h);
        let _ = BitBlt(
            mem,
            icon_x,
            icon_y,
            self.image_w.max(1),
            self.image_h.max(1),
            Some(icon_dc),
            0,
            0,
            SRCCOPY,
        );
        SelectObject(icon_dc, old_icon);
        let _ = DeleteDC(icon_dc);
        SetTextColor(mem, to_colorref(brand_text_color(self.dark)));
        let mut text_rect = RECT {
            left: 0,
            top: icon_y + icon + gap,
            right: self.frame_w,
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
        SelectObject(mem, old);
        let _ = DeleteDC(mem);
        if !self.frame_bits.is_null() {
            let n = (self.frame_w as usize) * (self.frame_h as usize) * 4;
            force_opaque(std::slice::from_raw_parts_mut(self.frame_bits, n));
        }
    }

    pub unsafe fn destroy(self) {
        let _ = DeleteObject(self.bitmap.into());
        let _ = DeleteObject(self.frame.into());
    }
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

unsafe fn alloc_dib(hdc: HDC, w: i32, h: i32) -> Result<(HBITMAP, *mut u8), String> {
    let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
    let info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        bmiColors: [RGBQUAD::default()],
    };
    let bmp = CreateDIBSection(Some(hdc), &info, DIB_RGB_COLORS, &mut bits, None, 0)
        .map_err(|e| e.to_string())?;
    if bits.is_null() {
        let _ = DeleteObject(bmp.into());
        return Err("CreateDIBSection 未返回像素".into());
    }
    Ok((bmp, bits.cast()))
}

pub fn present(hwnd: HWND) {
    unsafe {
        let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *const PaintData;
        let mut ps = PAINTSTRUCT::default();
        let hdc = BeginPaint(hwnd, &mut ps);
        if ptr.is_null() {
            let _ = EndPaint(hwnd, &ps);
            return;
        }
        let data = &*ptr;
        let mem = CreateCompatibleDC(Some(hdc));
        let old = SelectObject(mem, data.frame.into());
        let _ = BitBlt(
            hdc,
            0,
            0,
            data.frame_w,
            data.frame_h,
            Some(mem),
            0,
            0,
            SRCCOPY,
        );
        SelectObject(mem, old);
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

    #[test]
    fn light_composed_frame_corners_are_canvas() {
        use super::super::icon::{create_bitmap, load_icon};
        use crate::window_boot::canvas_bgra;
        use windows::Win32::Graphics::Gdi::{GetDC, ReleaseDC};

        unsafe {
            let hdc = GetDC(None);
            assert!(!hdc.is_invalid());
            let icon = load_icon().expect("128x128.png");
            let Color(r, g, b, _) = crate::window_boot::canvas_color(false);
            let icon = icon.onto_canvas(r, g, b);
            let bmp = create_bitmap(hdc, &icon).expect("icon dib");
            let data = PaintData::create(
                hdc,
                bmp,
                PaintSpec {
                    icon_px: 72,
                    gap_px: 16,
                    font_px: 18,
                    frame_w: 480,
                    frame_h: 300,
                    dark: false,
                },
            )
            .expect("compose");
            let frame = data.copy_frame().expect("frame");
            let canvas = canvas_bgra(false);
            let at = |x: i32, y: i32| {
                let i = ((y as usize) * (frame.w as usize) + (x as usize)) * 4;
                [
                    frame.pixels[i],
                    frame.pixels[i + 1],
                    frame.pixels[i + 2],
                    frame.pixels[i + 3],
                ]
            };
            assert_eq!(at(0, 0), canvas);
            assert_eq!(at(479, 0), canvas);
            assert_eq!(at(0, 299), canvas);
            assert_eq!(at(479, 299), canvas);
            assert_ne!(at(0, 0), [0, 0, 0, 255]);
            data.destroy();
            ReleaseDC(None, hdc);
        }
    }
}
