//! 启动图标：PNG 解码为 RGBA，再做成 GDI DIB。

use windows::Win32::Graphics::Gdi::{
    CreateCompatibleBitmap, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject,
    SelectObject, SetStretchBltMode, StretchBlt, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS, HALFTONE, HBITMAP, HDC, SRCCOPY,
};

pub struct IconRgba {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

pub fn load_icon() -> Option<IconRgba> {
    let bytes = include_bytes!("../../icons/128x128.png");
    let decoder = png::Decoder::new(&bytes[..]);
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).ok()?;
    let width = info.width;
    let height = info.height;
    let data = match info.color_type {
        png::ColorType::Rgba => buf[..info.buffer_size()].to_vec(),
        png::ColorType::Rgb => {
            let mut rgba = Vec::with_capacity((width * height * 4) as usize);
            for chunk in buf[..info.buffer_size()].chunks(3) {
                rgba.extend_from_slice(chunk);
                rgba.push(255);
            }
            rgba
        }
        _ => return None,
    };
    Some(IconRgba {
        width,
        height,
        data,
    })
}

pub unsafe fn create_bitmap(hdc: HDC, image: &IconRgba) -> Result<HBITMAP, String> {
    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: image.width as i32,
            biHeight: -(image.height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
    let bitmap = CreateDIBSection(Some(hdc), &bmi, DIB_RGB_COLORS, &mut bits, None, 0)
        .map_err(|e| e.to_string())?;
    if !bits.is_null() {
        let n = (image.width * image.height) as usize;
        let dest = std::slice::from_raw_parts_mut(bits as *mut u8, n * 4);
        for i in 0..n {
            let s = i * 4;
            dest[s] = image.data[s + 2];
            dest[s + 1] = image.data[s + 1];
            dest[s + 2] = image.data[s];
            dest[s + 3] = image.data[s + 3];
        }
    }
    Ok(bitmap)
}

/// 启动时按 DPI 把 Logo 拉到绘制尺寸，动画帧里只 BitBlt，禁止每帧 StretchBlt。
pub unsafe fn scale_bitmap(
    hdc: HDC,
    src: HBITMAP,
    src_w: i32,
    src_h: i32,
    dst_w: i32,
    dst_h: i32,
) -> Result<HBITMAP, String> {
    let dst_w = dst_w.max(1);
    let dst_h = dst_h.max(1);
    let dst = CreateCompatibleBitmap(hdc, dst_w, dst_h);
    if dst.is_invalid() {
        return Err("CreateCompatibleBitmap 失败".into());
    }
    let src_dc = CreateCompatibleDC(Some(hdc));
    let dst_dc = CreateCompatibleDC(Some(hdc));
    let old_src = SelectObject(src_dc, src.into());
    let old_dst = SelectObject(dst_dc, dst.into());
    let _ = SetStretchBltMode(dst_dc, HALFTONE);
    let ok = StretchBlt(
        dst_dc,
        0,
        0,
        dst_w,
        dst_h,
        Some(src_dc),
        0,
        0,
        src_w,
        src_h,
        SRCCOPY,
    );
    SelectObject(src_dc, old_src);
    SelectObject(dst_dc, old_dst);
    let _ = DeleteDC(src_dc);
    let _ = DeleteDC(dst_dc);
    if !ok.as_bool() {
        let _ = DeleteObject(dst.into());
        return Err("StretchBlt 缩放启动图标失败".into());
    }
    Ok(dst)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splash_icon_decodes() {
        let icon = load_icon().expect("128x128.png");
        assert_eq!(icon.width, 128);
        assert_eq!(icon.height, 128);
        assert_eq!(icon.data.len(), 128 * 128 * 4);
    }
}
