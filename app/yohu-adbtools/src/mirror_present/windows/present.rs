//! Present：交换链与回缓冲。不缩放、不转色、不算 contain。

use windows::core::{Interface, Result as WinResult};
use windows::Win32::Graphics::Direct3D11::{
    ID3D11Device, ID3D11DeviceContext, ID3D11RenderTargetView, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_ALPHA_MODE_PREMULTIPLIED, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_UNKNOWN,
    DXGI_SAMPLE_DESC,
};
use windows::Win32::Graphics::Dxgi::{
    IDXGIAdapter, IDXGIDevice, IDXGIFactory2, IDXGISwapChain1, DXGI_PRESENT,
    DXGI_SCALING_STRETCH, DXGI_SWAP_CHAIN_DESC1, DXGI_SWAP_CHAIN_FLAG,
    DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL, DXGI_USAGE_RENDER_TARGET_OUTPUT,
};

use super::d3d::D3dDevice;
use super::tex::even_px;

pub struct Present {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    swapchain: IDXGISwapChain1,
    rtv: Option<ID3D11RenderTargetView>,
    buf_w: u32,
    buf_h: u32,
}

impl Present {
    pub fn new(d3d: &D3dDevice, width: u32, height: u32) -> WinResult<Self> {
        let width = even_px(width);
        let height = even_px(height);
        let device = d3d.device.clone();
        let context = d3d.context.clone();
        let dxgi: IDXGIDevice = device.cast()?;
        let adapter: IDXGIAdapter = unsafe { dxgi.GetAdapter()? };
        let factory: IDXGIFactory2 = unsafe { adapter.GetParent()? };
        let desc = DXGI_SWAP_CHAIN_DESC1 {
            Width: width,
            Height: height,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            Stereo: false.into(),
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
            BufferCount: 2,
            Scaling: DXGI_SCALING_STRETCH,
            SwapEffect: DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL,
            AlphaMode: DXGI_ALPHA_MODE_PREMULTIPLIED,
            Flags: 0,
        };
        let swapchain = unsafe { factory.CreateSwapChainForComposition(&device, &desc, None)? };
        let mut present = Self {
            device,
            context,
            swapchain,
            rtv: None,
            buf_w: width,
            buf_h: height,
        };
        present.bind_backbuffer()?;
        Ok(present)
    }

    pub fn swapchain(&self) -> &IDXGISwapChain1 {
        &self.swapchain
    }

    pub fn context(&self) -> &ID3D11DeviceContext {
        &self.context
    }

    pub fn rtv(&self) -> Option<&ID3D11RenderTargetView> {
        self.rtv.as_ref()
    }

    pub fn even_host(width: u32, height: u32) -> (u32, u32) {
        (even_px(width.max(1)), even_px(height.max(1)))
    }

    pub fn matches_host(&self, width: u32, height: u32) -> bool {
        let (w, h) = Self::even_host(width, height);
        w == self.buf_w && h == self.buf_h
    }

    pub fn resize(&mut self, width: u32, height: u32) -> WinResult<()> {
        let width = even_px(width);
        let height = even_px(height);
        if width == self.buf_w && height == self.buf_h {
            return Ok(());
        }
        unsafe {
            self.context.OMSetRenderTargets(None, None);
        }
        self.rtv = None;
        unsafe {
            self.swapchain.ResizeBuffers(
                0,
                width,
                height,
                DXGI_FORMAT_UNKNOWN,
                DXGI_SWAP_CHAIN_FLAG(0),
            )?;
        }
        self.buf_w = width;
        self.buf_h = height;
        self.bind_backbuffer()
    }

    pub fn flip(&self) -> WinResult<()> {
        unsafe { self.swapchain.Present(0, DXGI_PRESENT(0)).ok() }
    }

    fn bind_backbuffer(&mut self) -> WinResult<()> {
        let tex: ID3D11Texture2D = unsafe { self.swapchain.GetBuffer(0)? };
        let mut rtv = None;
        unsafe {
            self.device
                .CreateRenderTargetView(&tex, None, Some(&mut rtv))?;
        }
        self.rtv = Some(rtv.ok_or_else(windows::core::Error::from_win32)?);
        Ok(())
    }
}
