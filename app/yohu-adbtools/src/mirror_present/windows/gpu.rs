//! 呈现装配：Convert → Scale → Compose → Present。核不进本文件。

#![cfg(windows)]

use windows::core::{Interface, Result as WinResult};
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Direct3D11::ID3D11Texture2D;
use windows::Win32::Graphics::Dxgi::IDXGIDevice;

use super::chrome::{ChromePainter, ChromeSpec};
use super::convert::YuvConvert;
use super::d3d::D3dDevice;
use super::occupancy::{apply_occupancy_clip, attach_dcomp, clip_now, DcompTree};
use super::present::Present;
use super::scale::RgbScale;
use crate::mirror_present::scale::Letterbox;
use crate::mirror_present::stage::OccupancyMotion;

pub struct Gpu {
    convert: YuvConvert,
    scale: RgbScale,
    present: Present,
    dcomp: DcompTree,
    chrome: Option<ChromePainter>,
    panel_r: u32,
    panel_stroke: f32,
    panel_border: u32,
}

impl Gpu {
    pub fn new(d3d: &D3dDevice, hwnd: HWND, width: u32, height: u32) -> WinResult<Self> {
        let present = Present::new(d3d, width, height)?;
        let dxgi: IDXGIDevice = d3d.device.cast()?;
        let (w, h) = Self::even_host(width, height);
        let dcomp = attach_dcomp(&dxgi, hwnd, present.swapchain(), w, h, 0)?;
        tracing::info!("投屏 HWND DirectComposition flip + 圆角 clip");
        Ok(Self {
            convert: YuvConvert::new(d3d),
            scale: RgbScale::new(&d3d.device)?,
            present,
            dcomp,
            chrome: None,
            panel_r: 0,
            panel_stroke: 0.0,
            panel_border: 0,
        })
    }

    pub fn set_letterbox_argb(&mut self, argb: u32) {
        self.convert.set_letterbox_argb(argb);
    }

    pub fn set_panel_chrome(&mut self, radius: u32, stroke_px: f32, border_argb: u32) {
        self.panel_r = radius;
        self.panel_stroke = stroke_px;
        self.panel_border = border_argb;
    }

    pub fn present_chrome(&mut self, spec: &ChromeSpec<'_>) -> WinResult<()> {
        if self.chrome.is_none() {
            self.chrome = Some(ChromePainter::new()?);
        }
        let Some(painter) = self.chrome.as_ref() else {
            return Err(windows::core::Error::from_win32());
        };
        painter.present(
            self.present.context(),
            self.present.swapchain(),
            self.visible_card(),
            spec,
        )?;
        self.commit_frame()
    }

    pub fn even_host(width: u32, height: u32) -> (u32, u32) {
        Present::even_host(width, height)
    }

    pub fn matches_host(&self, width: u32, height: u32) -> bool {
        self.present.matches_host(width, height)
    }

    pub fn resize(&mut self, width: u32, height: u32) -> WinResult<()> {
        self.present.resize(width, height)
    }

    /// 占用 clip 用主窗客户区坐标。Fill↔Dest 才插值。
    pub fn set_occupancy_clip(
        &mut self,
        x: i32,
        y: i32,
        w: u32,
        h: u32,
        radius: u32,
        motion: OccupancyMotion,
    ) -> WinResult<bool> {
        let left = x as f32;
        let top = y as f32;
        let right = left + w.max(1) as f32;
        let bottom = top + h.max(1) as f32;
        apply_occupancy_clip(&mut self.dcomp, left, top, right, bottom, radius, motion)
    }

    pub fn present_cpu_nv12(
        &mut self,
        picture_w: u32,
        picture_h: u32,
        content_w: u32,
        content_h: u32,
        nv12: &[u8],
        dest: Letterbox,
    ) -> WinResult<()> {
        self.convert.set_content(content_w, content_h);
        let tex = self.convert.upload_cpu_nv12(picture_w, picture_h, nv12)?;
        self.blit_layers(&tex, 0, dest)?;
        self.convert.remember_cpu(nv12);
        self.commit_frame()
    }

    pub fn present_gpu_nv12(
        &mut self,
        content_w: u32,
        content_h: u32,
        texture: &ID3D11Texture2D,
        subresource: u32,
        dest: Letterbox,
    ) -> WinResult<()> {
        self.convert.set_content(content_w, content_h);
        self.convert.note_texture(texture);
        self.blit_layers(texture, subresource, dest)?;
        self.convert.remember_gpu(texture, subresource);
        self.commit_frame()
    }

    pub fn replay_last(&mut self, dest: Letterbox) -> WinResult<bool> {
        if let Some((texture, subresource)) = self.convert.last_gpu() {
            let (cw, ch) = self.convert.content_size();
            self.present_gpu_nv12(cw, ch, &texture, subresource, dest)?;
            return Ok(true);
        }
        let Some(nv12) = self.convert.last_cpu() else {
            return Ok(false);
        };
        let (width, height) = self.convert.video_size();
        let (cw, ch) = self.convert.content_size();
        if width == 0 || height == 0 || cw == 0 || ch == 0 {
            return Ok(false);
        }
        self.present_cpu_nv12(width, height, cw, ch, &nv12, dest)?;
        Ok(true)
    }

    pub fn screenshot_bgra(&mut self) -> WinResult<Option<(u32, u32, Vec<u8>)>> {
        self.convert.screenshot_bgra()
    }

    fn blit_layers(
        &mut self,
        texture: &ID3D11Texture2D,
        subresource: u32,
        dest: Letterbox,
    ) -> WinResult<()> {
        let srv = self.convert.yuv_to_rgb(texture, subresource, dest)?.clone();
        let (src_w, src_h) = self.convert.rgb_size();
        if self.convert.take_scale_log() {
            let (content_w, content_h) = self.convert.content_size();
            let (texture_w, texture_h) = self.convert.video_size();
            tracing::info!(
                content_w,
                content_h,
                crop_w = dest.crop_w,
                crop_h = dest.crop_h,
                texture_w,
                texture_h,
                dest_w = dest.width,
                dest_h = dest.height,
                nearest = dest.nearest,
                "投屏按源矩形面积缩小"
            );
        }
        let Some(rtv) = self.present.rtv() else {
            return Err(windows::core::Error::from_win32());
        };
        self.scale.draw(
            self.present.context(),
            rtv,
            &srv,
            dest,
            (src_w, src_h),
            [0.0, 0.0, 0.0, 0.0],
        )
    }

    pub fn visible_card(&self) -> Letterbox {
        let (left, top, right, bottom) = clip_now(&self.dcomp);
        Letterbox {
            x: left.round() as i32,
            y: top.round() as i32,
            width: (right - left).round().max(1.0) as u32,
            height: (bottom - top).round().max(1.0) as u32,
            nearest: false,
            crop_w: 0,
            crop_h: 0,
        }
    }

    fn commit_frame(&mut self) -> WinResult<()> {
        if self.panel_stroke > 0.0 && self.panel_border != 0 {
            if self.chrome.is_none() {
                self.chrome = Some(ChromePainter::new()?);
            }
            if let Some(painter) = self.chrome.as_ref() {
                painter.stroke(
                    self.present.context(),
                    self.present.swapchain(),
                    self.visible_card(),
                    self.panel_r,
                    self.panel_stroke,
                    self.panel_border,
                )?;
            }
        }
        self.present.flip()
    }
}
