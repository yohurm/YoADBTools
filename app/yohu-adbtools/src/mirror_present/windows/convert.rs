//! Convert：YUV crop → RGB crop，1:1。不改 dest、不算 contain。

use std::mem::ManuallyDrop;

use windows::core::Result as WinResult;
use windows::Win32::Foundation::RECT;
use windows::Win32::Graphics::Direct3D::D3D_SRV_DIMENSION_TEXTURE2D;
use windows::Win32::Graphics::Direct3D11::{
    ID3D11Device, ID3D11DeviceContext, ID3D11ShaderResourceView,
    ID3D11Texture2D, ID3D11VideoContext, ID3D11VideoContext1, ID3D11VideoDevice,
    ID3D11VideoProcessor, ID3D11VideoProcessorEnumerator, D3D11_BIND_DECODER,
    D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_BOX, D3D11_CPU_ACCESS_READ,
    D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ, D3D11_SHADER_RESOURCE_VIEW_DESC,
    D3D11_SHADER_RESOURCE_VIEW_DESC_0, D3D11_TEX2D_SRV, D3D11_TEX2D_VPIV, D3D11_TEX2D_VPOV,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT, D3D11_USAGE_STAGING, D3D11_VIDEO_COLOR,
    D3D11_VIDEO_COLOR_0, D3D11_VIDEO_COLOR_RGBA, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
    D3D11_VIDEO_PROCESSOR_CONTENT_DESC, D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC,
    D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0, D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC,
    D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0, D3D11_VIDEO_PROCESSOR_STREAM,
    D3D11_VIDEO_USAGE_PLAYBACK_NORMAL, D3D11_VPIV_DIMENSION_TEXTURE2D,
    D3D11_VPOV_DIMENSION_TEXTURE2D,
};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709, DXGI_COLOR_SPACE_YCBCR_FULL_G22_LEFT_P709,
    DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_NV12, DXGI_RATIONAL, DXGI_SAMPLE_DESC,
};

use super::d3d::D3dDevice;
use super::tex::create_texture;
use crate::mirror_present::scale::{content_source_size, Letterbox};
use crate::mirror_present::stage::argb_to_rgba;
use crate::tokens::STAGE_LIGHT_SURFACE;

pub struct YuvConvert {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    video_device: Option<ID3D11VideoDevice>,
    video_ctx: Option<ID3D11VideoContext>,
    video_ctx1: Option<ID3D11VideoContext1>,
    video_w: u32,
    video_h: u32,
    content_w: u32,
    content_h: u32,
    crop_w: u32,
    crop_h: u32,
    vp_enum: Option<ID3D11VideoProcessorEnumerator>,
    processor: Option<ID3D11VideoProcessor>,
    native_rgb: Option<ID3D11Texture2D>,
    native_srv: Option<ID3D11ShaderResourceView>,
    native_w: u32,
    native_h: u32,
    nv12: Option<ID3D11Texture2D>,
    last_cpu: Option<Vec<u8>>,
    last_video: Option<(ID3D11Texture2D, u32)>,
    letterbox_argb: u32,
    scale_logged: bool,
}

impl YuvConvert {
    pub fn new(d3d: &D3dDevice) -> Self {
        Self {
            device: d3d.device.clone(),
            context: d3d.context.clone(),
            video_device: d3d.video_device.clone(),
            video_ctx: d3d.video_ctx.clone(),
            video_ctx1: d3d.video_ctx1.clone(),
            video_w: 0,
            video_h: 0,
            content_w: 0,
            content_h: 0,
            crop_w: 0,
            crop_h: 0,
            vp_enum: None,
            processor: None,
            native_rgb: None,
            native_srv: None,
            native_w: 0,
            native_h: 0,
            nv12: None,
            last_cpu: None,
            last_video: None,
            letterbox_argb: STAGE_LIGHT_SURFACE,
            scale_logged: false,
        }
    }

    pub fn set_letterbox_argb(&mut self, argb: u32) {
        self.letterbox_argb = argb;
    }

    pub fn content_size(&self) -> (u32, u32) {
        (self.content_w, self.content_h)
    }

    pub fn video_size(&self) -> (u32, u32) {
        (self.video_w, self.video_h)
    }

    pub fn rgb_size(&self) -> (u32, u32) {
        (self.native_w, self.native_h)
    }

    pub fn take_scale_log(&mut self) -> bool {
        if self.scale_logged {
            return false;
        }
        self.scale_logged = true;
        true
    }

    pub fn set_content(&mut self, width: u32, height: u32) {
        if self.content_w == width && self.content_h == height {
            return;
        }
        self.content_w = width;
        self.content_h = height;
        self.crop_w = 0;
        self.crop_h = 0;
        self.drop_native_rgb();
        self.scale_logged = false;
    }

    pub fn note_texture(&mut self, texture: &ID3D11Texture2D) {
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        unsafe {
            texture.GetDesc(&mut desc);
        }
        if desc.Width != self.video_w || desc.Height != self.video_h {
            self.video_w = desc.Width.max(1);
            self.video_h = desc.Height.max(1);
            self.vp_enum = None;
            self.processor = None;
            self.drop_native_rgb();
        }
    }

    pub fn apply_dest_crop(&mut self, dest: Letterbox) {
        let (w, h) = if dest.crop_w > 0 && dest.crop_h > 0 {
            (dest.crop_w, dest.crop_h)
        } else {
            (self.content_w.max(1), self.content_h.max(1))
        };
        if self.crop_w == w && self.crop_h == h {
            return;
        }
        self.crop_w = w;
        self.crop_h = h;
        self.drop_native_rgb();
    }

    pub fn remember_gpu(&mut self, texture: &ID3D11Texture2D, subresource: u32) {
        self.last_cpu = None;
        self.last_video = Some((texture.clone(), subresource));
    }

    pub fn remember_cpu(&mut self, nv12: &[u8]) {
        self.last_cpu = Some(nv12.to_vec());
        self.last_video = None;
    }

    pub fn last_gpu(&self) -> Option<(ID3D11Texture2D, u32)> {
        self.last_video.clone()
    }

    pub fn last_cpu(&self) -> Option<Vec<u8>> {
        self.last_cpu.clone()
    }

    pub fn yuv_to_rgb(
        &mut self,
        texture: &ID3D11Texture2D,
        subresource: u32,
        dest: Letterbox,
    ) -> WinResult<&ID3D11ShaderResourceView> {
        self.apply_dest_crop(dest);
        self.ensure_processor()?;
        self.ensure_native_rgb()?;
        self.vp_convert_native(texture, subresource)?;
        self.native_srv
            .as_ref()
            .ok_or_else(windows::core::Error::from_win32)
    }

    pub fn upload_cpu_nv12(&mut self, width: u32, height: u32, nv12: &[u8]) -> WinResult<ID3D11Texture2D> {
        self.ensure_nv12(width, height)?;
        let y_size = self.video_w as usize * self.video_h as usize;
        let need = y_size + y_size / 2;
        if nv12.len() < need {
            return Err(windows::core::Error::from_win32());
        }
        let tex = self
            .nv12
            .as_ref()
            .ok_or_else(windows::core::Error::from_win32)?;
        unsafe {
            self.context.UpdateSubresource(
                tex,
                0,
                None,
                nv12.as_ptr() as *const _,
                self.video_w,
                0,
            );
        }
        Ok(tex.clone())
    }

    pub fn screenshot_bgra(&mut self) -> WinResult<Option<(u32, u32, Vec<u8>)>> {
        let (width, height) = self.content_rect();
        if self.content_w == 0 || self.content_h == 0 {
            return Ok(None);
        }
        let nv12 = if let Some(cpu) = self.last_cpu.as_ref() {
            crop_nv12(self.video_w, self.video_h, width, height, cpu)
        } else {
            let Some((texture, subresource)) = self.last_video.clone() else {
                return Ok(None);
            };
            destage_nv12(
                &self.device,
                &self.context,
                &texture,
                subresource,
                width,
                height,
            )?
        };
        Ok(Some((width, height, nv12_to_bgra(width, height, &nv12))))
    }

    fn drop_native_rgb(&mut self) {
        self.native_rgb = None;
        self.native_srv = None;
        self.native_w = 0;
        self.native_h = 0;
        self.scale_logged = false;
    }

    fn ensure_native_rgb(&mut self) -> WinResult<ID3D11Texture2D> {
        let (width, height) = self.content_rect();
        if let Some(tex) = self.native_rgb.as_ref() {
            if self.native_w == width && self.native_h == height {
                return Ok(tex.clone());
            }
        }
        self.drop_native_rgb();
        let desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: (D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        let tex = create_texture(&self.device, &desc)?;
        let mut rtv = None;
        unsafe {
            self.device
                .CreateRenderTargetView(&tex, None, Some(&mut rtv))?;
        }
        let srv_desc = D3D11_SHADER_RESOURCE_VIEW_DESC {
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            ViewDimension: D3D_SRV_DIMENSION_TEXTURE2D,
            Anonymous: D3D11_SHADER_RESOURCE_VIEW_DESC_0 {
                Texture2D: D3D11_TEX2D_SRV {
                    MostDetailedMip: 0,
                    MipLevels: 1,
                },
            },
        };
        let mut srv = None;
        unsafe {
            self.device
                .CreateShaderResourceView(&tex, Some(&srv_desc), Some(&mut srv))?;
        }
        let _rtv = rtv.ok_or_else(windows::core::Error::from_win32)?;
        self.native_srv = Some(srv.ok_or_else(windows::core::Error::from_win32)?);
        self.native_w = width;
        self.native_h = height;
        self.native_rgb = Some(tex.clone());
        Ok(tex)
    }

    fn vp_convert_native(
        &mut self,
        texture: &ID3D11Texture2D,
        subresource: u32,
    ) -> WinResult<()> {
        let native = self
            .native_rgb
            .clone()
            .ok_or_else(windows::core::Error::from_win32)?;
        let src = self.source_rect();
        let dst = RECT {
            left: 0,
            top: 0,
            right: self.native_w as i32,
            bottom: self.native_h as i32,
        };
        self.vp_blit_to(&native, texture, subresource, src, dst, dst)?;
        unsafe {
            self.context.OMSetRenderTargets(None, None);
        }
        Ok(())
    }

    fn vp_blit_to(
        &mut self,
        output_tex: &ID3D11Texture2D,
        texture: &ID3D11Texture2D,
        subresource: u32,
        src: RECT,
        dst: RECT,
        target: RECT,
    ) -> WinResult<()> {
        let video_device = self
            .video_device
            .clone()
            .ok_or_else(windows::core::Error::from_win32)?;
        let video_ctx = self
            .video_ctx
            .clone()
            .ok_or_else(windows::core::Error::from_win32)?;
        let enumerator = self
            .vp_enum
            .clone()
            .ok_or_else(windows::core::Error::from_win32)?;
        let processor = self
            .processor
            .clone()
            .ok_or_else(windows::core::Error::from_win32)?;
        let input_desc = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
            FourCC: 0,
            ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
            Anonymous: D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0 {
                Texture2D: D3D11_TEX2D_VPIV {
                    MipSlice: 0,
                    ArraySlice: subresource,
                },
            },
        };
        let mut input = None;
        unsafe {
            video_device.CreateVideoProcessorInputView(
                texture,
                &enumerator,
                &input_desc,
                Some(&mut input),
            )?;
        }
        let input = input.ok_or_else(windows::core::Error::from_win32)?;
        let output_desc = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
            ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
            Anonymous: D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0 {
                Texture2D: D3D11_TEX2D_VPOV { MipSlice: 0 },
            },
        };
        let mut output = None;
        unsafe {
            video_device.CreateVideoProcessorOutputView(
                output_tex,
                &enumerator,
                &output_desc,
                Some(&mut output),
            )?;
        }
        let output = output.ok_or_else(windows::core::Error::from_win32)?;
        let letterbox = self.letterbox_video_color();
        unsafe {
            video_ctx.VideoProcessorSetOutputTargetRect(&processor, true, Some(&target));
            video_ctx.VideoProcessorSetOutputBackgroundColor(&processor, false, &letterbox);
            video_ctx.VideoProcessorSetStreamFrameFormat(
                &processor,
                0,
                D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
            );
            video_ctx.VideoProcessorSetStreamAutoProcessingMode(&processor, 0, false);
            video_ctx.VideoProcessorSetStreamSourceRect(&processor, 0, true, Some(&src));
            video_ctx.VideoProcessorSetStreamDestRect(&processor, 0, true, Some(&dst));
        }
        if let Some(ctx1) = self.video_ctx1.as_ref() {
            unsafe {
                ctx1.VideoProcessorSetStreamColorSpace1(
                    &processor,
                    0,
                    DXGI_COLOR_SPACE_YCBCR_FULL_G22_LEFT_P709,
                );
                ctx1.VideoProcessorSetOutputColorSpace1(
                    &processor,
                    DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709,
                );
            }
        }
        let mut stream = D3D11_VIDEO_PROCESSOR_STREAM {
            Enable: true.into(),
            OutputIndex: 0,
            InputFrameOrField: 0,
            pInputSurface: ManuallyDrop::new(Some(input)),
            ..Default::default()
        };
        let blt = unsafe {
            video_ctx.VideoProcessorBlt(&processor, &output, 0, std::slice::from_ref(&stream))
        };
        unsafe {
            ManuallyDrop::drop(&mut stream.pInputSurface);
        }
        blt
    }

    fn ensure_processor(&mut self) -> WinResult<()> {
        if self.processor.is_some() && self.vp_enum.is_some() {
            return Ok(());
        }
        let Some(video_device) = self.video_device.as_ref() else {
            return Err(windows::core::Error::from_win32());
        };
        let desc = D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
            InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
            InputFrameRate: DXGI_RATIONAL {
                Numerator: 60,
                Denominator: 1,
            },
            InputWidth: self.video_w.max(self.content_w).max(2),
            InputHeight: self.video_h.max(self.content_h).max(2),
            OutputFrameRate: DXGI_RATIONAL {
                Numerator: 60,
                Denominator: 1,
            },
            OutputWidth: 4096,
            OutputHeight: 4096,
            Usage: D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
        };
        let enumerator = unsafe { video_device.CreateVideoProcessorEnumerator(&desc)? };
        let processor = unsafe { video_device.CreateVideoProcessor(&enumerator, 0)? };
        self.vp_enum = Some(enumerator);
        self.processor = Some(processor);
        Ok(())
    }

    fn ensure_nv12(&mut self, width: u32, height: u32) -> WinResult<()> {
        let width = width.max(2) & !1;
        let height = height.max(2) & !1;
        if self.video_w == width && self.video_h == height && self.nv12.is_some() {
            return Ok(());
        }
        self.vp_enum = None;
        self.processor = None;
        self.drop_native_rgb();
        let desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_NV12,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: (D3D11_BIND_DECODER.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        self.nv12 = match create_texture(&self.device, &desc) {
            Ok(tex) => Some(tex),
            Err(_) => {
                let mut desc = desc;
                desc.BindFlags = D3D11_BIND_SHADER_RESOURCE.0 as u32;
                Some(create_texture(&self.device, &desc)?)
            }
        };
        self.video_w = width;
        self.video_h = height;
        Ok(())
    }

    fn letterbox_video_color(&self) -> D3D11_VIDEO_COLOR {
        let [r, g, b, a] = argb_to_rgba(self.letterbox_argb);
        D3D11_VIDEO_COLOR {
            Anonymous: D3D11_VIDEO_COLOR_0 {
                RGBA: D3D11_VIDEO_COLOR_RGBA {
                    R: r,
                    G: g,
                    B: b,
                    A: a,
                },
            },
        }
    }

    fn content_rect(&self) -> (u32, u32) {
        let (cw, ch) = if self.crop_w > 0 && self.crop_h > 0 {
            (self.crop_w, self.crop_h)
        } else {
            (self.content_w.max(1), self.content_h.max(1))
        };
        content_source_size(cw, ch, self.video_w.max(1), self.video_h.max(1))
    }

    fn source_rect(&self) -> RECT {
        let (w, h) = self.content_rect();
        RECT {
            left: 0,
            top: 0,
            right: w as i32,
            bottom: h as i32,
        }
    }
}

fn crop_nv12(src_w: u32, src_h: u32, crop_w: u32, crop_h: u32, nv12: &[u8]) -> Vec<u8> {
    let (crop_w, crop_h) = content_source_size(crop_w, crop_h, src_w, src_h);
    if crop_w == src_w && crop_h == src_h {
        return nv12.to_vec();
    }
    let sw = src_w as usize;
    let cw = crop_w as usize;
    let ch = crop_h as usize;
    let y_src = sw * src_h as usize;
    let mut out = vec![0u8; cw * ch * 3 / 2];
    if nv12.len() < y_src + y_src / 2 {
        return out;
    }
    for y in 0..ch {
        let src = y * sw;
        let dst = y * cw;
        out[dst..dst + cw].copy_from_slice(&nv12[src..src + cw]);
    }
    let uv_src = y_src;
    let uv_dst = cw * ch;
    for y in 0..ch / 2 {
        let src = uv_src + y * sw;
        let dst = uv_dst + y * cw;
        out[dst..dst + cw].copy_from_slice(&nv12[src..src + cw]);
    }
    out
}

fn destage_nv12(
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    texture: &ID3D11Texture2D,
    subresource: u32,
    width: u32,
    height: u32,
) -> WinResult<Vec<u8>> {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: width.max(2) & !1,
        Height: height.max(2) & !1,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_NV12,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_STAGING,
        BindFlags: 0,
        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
        MiscFlags: 0,
    };
    let staging = create_texture(device, &desc)?;
    let src = D3D11_BOX {
        left: 0,
        top: 0,
        front: 0,
        right: desc.Width,
        bottom: desc.Height,
        back: 1,
    };
    unsafe {
        context.CopySubresourceRegion(&staging, 0, 0, 0, 0, texture, subresource, Some(&src));
    }
    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    unsafe {
        context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
    }
    let packed = pack_nv12_mapped(&mapped, desc.Width, desc.Height);
    unsafe {
        context.Unmap(&staging, 0);
    }
    Ok(packed)
}

fn pack_nv12_mapped(mapped: &D3D11_MAPPED_SUBRESOURCE, width: u32, height: u32) -> Vec<u8> {
    let w = width as usize;
    let h = height as usize;
    let pitch = mapped.RowPitch as usize;
    let src = mapped.pData as *const u8;
    let mut out = vec![0u8; w * h * 3 / 2];
    for y in 0..h {
        let row = unsafe { std::slice::from_raw_parts(src.add(y * pitch), w) };
        out[y * w..(y + 1) * w].copy_from_slice(row);
    }
    let uv = w * h;
    for y in 0..h / 2 {
        let row = unsafe { std::slice::from_raw_parts(src.add((h + y) * pitch), w) };
        let o = uv + y * w;
        out[o..o + w].copy_from_slice(row);
    }
    out
}

fn nv12_to_bgra(width: u32, height: u32, nv12: &[u8]) -> Vec<u8> {
    let w = width as usize;
    let h = height as usize;
    let y_size = w * h;
    let mut out = vec![0u8; y_size * 4];
    if nv12.len() < y_size + y_size / 2 {
        return out;
    }
    for y in 0..h {
        for x in 0..w {
            let luma = nv12[y * w + x] as f32 / 255.0;
            let uv_i = y_size + (y / 2) * w + (x & !1);
            let u = nv12[uv_i] as f32 / 255.0 - 0.5;
            let v = nv12[uv_i + 1] as f32 / 255.0 - 0.5;
            let r = (luma + 1.5748 * v).clamp(0.0, 1.0);
            let g = (luma - 0.1873 * u - 0.4681 * v).clamp(0.0, 1.0);
            let b = (luma + 1.8556 * u).clamp(0.0, 1.0);
            let i = (y * w + x) * 4;
            out[i] = (b * 255.0) as u8;
            out[i + 1] = (g * 255.0) as u8;
            out[i + 2] = (r * 255.0) as u8;
            out[i + 3] = 255;
        }
    }
    out
}
