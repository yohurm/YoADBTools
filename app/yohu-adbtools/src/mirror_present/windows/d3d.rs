//! 进程内共享 D3D11 设备。解码座与 HWND 交换链共用，不跟窗口走。

#![cfg(windows)]

use std::sync::Arc;

use windows::core::{Interface, Result as WinResult};
use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Multithread, ID3D11VideoContext,
    ID3D11VideoContext1, ID3D11VideoDevice, D3D11_CREATE_DEVICE_BGRA_SUPPORT,
    D3D11_CREATE_DEVICE_FLAG, D3D11_CREATE_DEVICE_VIDEO_SUPPORT, D3D11_SDK_VERSION,
};
use windows::Win32::Graphics::Dxgi::IDXGIDevice1;
use windows::Win32::Media::MediaFoundation::{IMFDXGIDeviceManager, MFCreateDXGIDeviceManager};

pub struct D3dDevice {
    pub device: ID3D11Device,
    pub context: ID3D11DeviceContext,
    pub dxgi_manager: Option<IMFDXGIDeviceManager>,
    pub video_device: Option<ID3D11VideoDevice>,
    pub video_ctx: Option<ID3D11VideoContext>,
    pub video_ctx1: Option<ID3D11VideoContext1>,
}

// 创建时 `SetMultithreadProtected(true)`；解码座与 HWND 表面共用。
unsafe impl Send for D3dDevice {}
unsafe impl Sync for D3dDevice {}

impl D3dDevice {
    pub fn create() -> WinResult<Arc<Self>> {
        let (device, context) = create_device()?;
        if let Ok(mt) = device.cast::<ID3D11Multithread>() {
            unsafe {
                let _ = mt.SetMultithreadProtected(true);
            }
        }
        if let Ok(dxgi1) = device.cast::<IDXGIDevice1>() {
            let _ = unsafe { dxgi1.SetMaximumFrameLatency(1) };
        }
        let dxgi_manager = create_dxgi_manager(&device);
        let video_device = device.cast::<ID3D11VideoDevice>().ok();
        let video_ctx = context.cast::<ID3D11VideoContext>().ok();
        let video_ctx1 = context.cast::<ID3D11VideoContext1>().ok();
        if video_device.is_some() && video_ctx.is_some() {
            tracing::info!("投屏 D3D11 设备已建立（解码座与表面共用）");
        } else {
            tracing::warn!("本机没有 D3D11 Video Processor，无法 1:1 转 RGB");
        }
        Ok(Arc::new(Self {
            device,
            context,
            dxgi_manager,
            video_device,
            video_ctx,
            video_ctx1,
        }))
    }
}

fn create_device() -> WinResult<(ID3D11Device, ID3D11DeviceContext)> {
    let video = D3D11_CREATE_DEVICE_FLAG(
        D3D11_CREATE_DEVICE_BGRA_SUPPORT.0 | D3D11_CREATE_DEVICE_VIDEO_SUPPORT.0,
    );
    match create_device_with(video) {
        Ok(pair) => Ok(pair),
        Err(_) => create_device_with(D3D11_CREATE_DEVICE_BGRA_SUPPORT),
    }
}

fn create_device_with(
    flags: D3D11_CREATE_DEVICE_FLAG,
) -> WinResult<(ID3D11Device, ID3D11DeviceContext)> {
    let mut device = None;
    let mut context = None;
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            Default::default(),
            flags,
            Some(&[D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0]),
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )?;
    }
    Ok((
        device.ok_or_else(windows::core::Error::from_win32)?,
        context.ok_or_else(windows::core::Error::from_win32)?,
    ))
}

fn create_dxgi_manager(device: &ID3D11Device) -> Option<IMFDXGIDeviceManager> {
    let mut token = 0u32;
    let mut manager = None;
    unsafe { MFCreateDXGIDeviceManager(&mut token, &mut manager) }.ok()?;
    let manager = manager?;
    let unknown: windows::core::IUnknown = device.cast().ok()?;
    unsafe { manager.ResetDevice(&unknown, token) }.ok()?;
    Some(manager)
}
