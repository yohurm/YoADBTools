//! I420 → BGRA。面积核与点采都在这里，不引入 libyuv / libswscale。

use super::super::scale::{scale_kernel, Letterbox, ScaleKernel};

/// 解码线程持有的一帧。下一帧可以覆盖解码器自己的缓冲，这一份已经拷出来。
#[derive(Clone)]
pub struct OwnedYuv {
    pub width: u32,
    pub height: u32,
    pub y: Vec<u8>,
    pub u: Vec<u8>,
    pub v: Vec<u8>,
    pub y_stride: usize,
    pub c_stride: usize,
}

pub fn copy_i420(
    width: u32,
    height: u32,
    y_ptr: *const u8,
    u_ptr: *const u8,
    v_ptr: *const u8,
    y_stride: i32,
    c_stride: i32,
) -> Option<OwnedYuv> {
    if width == 0 || height == 0 || y_ptr.is_null() || u_ptr.is_null() || v_ptr.is_null() {
        return None;
    }
    let y_stride = (y_stride as usize).max(width as usize);
    let c_stride = (c_stride as usize).max((width as usize).div_ceil(2));
    let chroma_h = (height as usize).div_ceil(2);
    let mut y = vec![0u8; y_stride * height as usize];
    let mut u = vec![0u8; c_stride * chroma_h];
    let mut v = vec![0u8; c_stride * chroma_h];
    unsafe {
        std::ptr::copy_nonoverlapping(y_ptr, y.as_mut_ptr(), y.len());
        std::ptr::copy_nonoverlapping(u_ptr, u.as_mut_ptr(), u.len());
        std::ptr::copy_nonoverlapping(v_ptr, v.as_mut_ptr(), v.len());
    }
    Some(OwnedYuv {
        width,
        height,
        y,
        u,
        v,
        y_stride,
        c_stride,
    })
}

/// NV12（Y + 交错 UV）收成同一份 I420，后面的缩放只认一种平面。
pub fn nv12_to_i420(
    width: u32,
    height: u32,
    y_src: &[u8],
    y_stride: usize,
    uv_src: &[u8],
    uv_stride: usize,
) -> OwnedYuv {
    let y_stride = y_stride.max(width as usize);
    let c_stride = (width as usize).div_ceil(2);
    let chroma_h = (height as usize).div_ceil(2);
    let mut y = vec![0u8; y_stride * height as usize];
    let mut u = vec![0u8; c_stride * chroma_h];
    let mut v = vec![0u8; c_stride * chroma_h];
    for row in 0..height as usize {
        let src = row * y_stride;
        let end = (src + width as usize).min(y_src.len());
        if src < end {
            y[src..src + (end - src)].copy_from_slice(&y_src[src..end]);
        }
    }
    for row in 0..chroma_h {
        let src = row * uv_stride;
        for col in 0..c_stride {
            let i = src + col * 2;
            if i + 1 < uv_src.len() {
                u[row * c_stride + col] = uv_src[i];
                v[row * c_stride + col] = uv_src[i + 1];
            }
        }
    }
    OwnedYuv {
        width,
        height,
        y,
        u,
        v,
        y_stride,
        c_stride,
    }
}

/// 缩到 dest。缩小走面积核，1:1 和整数倍走点采。输出小端 BGRA，alpha 不透明。
pub fn scale_bgra(src: &OwnedYuv, dest: Letterbox) -> Vec<u8> {
    let dw = dest.width.max(1);
    let dh = dest.height.max(1);
    match scale_kernel(src.width, src.height, dest) {
        ScaleKernel::Nearest => sample(src, dw, dh, false),
        ScaleKernel::Area => sample(src, dw, dh, true),
    }
}

fn sample(src: &OwnedYuv, dw: u32, dh: u32, area: bool) -> Vec<u8> {
    let sw = src.width.max(1);
    let sh = src.height.max(1);
    let mut out = vec![0u8; dw as usize * dh as usize * 4];
    for dy in 0..dh {
        let (y0, y1) = span(dy, dh, sh, area);
        for dx in 0..dw {
            let (x0, x1) = span(dx, dw, sw, area);
            let (y, u, v) = average(src, x0, x1, y0, y1);
            let px = yuv601(y, u, v);
            let o = ((dy as usize * dw as usize) + dx as usize) * 4;
            out[o..o + 4].copy_from_slice(&px);
        }
    }
    out
}

fn span(i: u32, dest: u32, src: u32, area: bool) -> (u32, u32) {
    if !area {
        let s = (i as u64 * src as u64 / dest as u64) as u32;
        return (s.min(src - 1), s.min(src - 1) + 1);
    }
    let a = (i as u64 * src as u64 / dest as u64) as u32;
    let b = (((i as u64 + 1) * src as u64) / dest as u64) as u32;
    let b = b.max(a + 1).min(src);
    (a.min(src - 1), b)
}

fn average(src: &OwnedYuv, x0: u32, x1: u32, y0: u32, y1: u32) -> (i32, i32, i32) {
    let mut ys = 0i32;
    let mut us = 0i32;
    let mut vs = 0i32;
    let mut n = 0i32;
    for y in y0..y1 {
        let row = y as usize * src.y_stride;
        for x in x0..x1 {
            let i = row + x as usize;
            ys += src.y.get(i).copied().unwrap_or(16) as i32;
            let cx = (x as usize) / 2;
            let cy = (y as usize) / 2;
            let ci = cy * src.c_stride + cx;
            us += src.u.get(ci).copied().unwrap_or(128) as i32;
            vs += src.v.get(ci).copied().unwrap_or(128) as i32;
            n += 1;
        }
    }
    let n = n.max(1);
    (ys / n, us / n, vs / n)
}

fn yuv601(y: i32, u: i32, v: i32) -> [u8; 4] {
    let c = y - 16;
    let d = u - 128;
    let e = v - 128;
    let r = (298 * c + 409 * e + 128) >> 8;
    let g = (298 * c - 100 * d - 208 * e + 128) >> 8;
    let b = (298 * c + 516 * d + 128) >> 8;
    [clamp(b), clamp(g), clamp(r), 255]
}

fn clamp(v: i32) -> u8 {
    v.clamp(0, 255) as u8
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mirror_present::scale::Letterbox;

    fn solid(y: u8, u: u8, v: u8) -> OwnedYuv {
        OwnedYuv {
            width: 2,
            height: 2,
            y: vec![y; 4],
            u: vec![u],
            v: vec![v],
            y_stride: 2,
            c_stride: 1,
        }
    }

    #[test]
    fn nearest_keeps_a_limited_range_black() {
        let src = solid(16, 128, 128);
        let dest = Letterbox {
            x: 0,
            y: 0,
            width: 2,
            height: 2,
            nearest: true,
            crop_w: 2,
            crop_h: 2,
        };
        let bgra = scale_bgra(&src, dest);
        assert_eq!(&bgra[0..4], &[0, 0, 0, 255]);
    }

    #[test]
    fn area_shrink_averages_the_footprint() {
        let mut src = solid(16, 128, 128);
        src.y = vec![16, 235, 16, 235];
        let dest = Letterbox {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            nearest: false,
            crop_w: 2,
            crop_h: 2,
        };
        let bgra = scale_bgra(&src, dest);
        assert_eq!(bgra.len(), 4);
        assert_eq!(bgra[3], 255);
        assert!(bgra[0] > 0);
    }
}
