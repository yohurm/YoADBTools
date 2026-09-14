//! overlay 交换链：D3D11 设备 + composition swapchain 上传 BGRA。

use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
    D3D11_BIND_SHADER_RESOURCE, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION,
    D3D11_SUBRESOURCE_DATA, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT,
};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_ALPHA_MODE_PREMULTIPLIED, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC,
};
use windows::Win32::Graphics::Dxgi::{
    IDXGIFactory2, IDXGISwapChain1, DXGI_PRESENT, DXGI_SCALING_STRETCH, DXGI_SWAP_CHAIN_DESC1,
    DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL, DXGI_USAGE_RENDER_TARGET_OUTPUT,
};

pub fn create_device() -> Option<(ID3D11Device, ID3D11DeviceContext)> {
    let mut device = None;
    let mut context = None;
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            Default::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            Some(&[D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0]),
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
        .ok()?;
    }
    Some((device?, context?))
}

fn upload_texture(device: &ID3D11Device, w: i32, h: i32, pixels: &[u8]) -> Option<ID3D11Texture2D> {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: w.max(1) as u32,
        Height: h.max(1) as u32,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
        ..Default::default()
    };
    let init = D3D11_SUBRESOURCE_DATA {
        pSysMem: pixels.as_ptr().cast(),
        SysMemPitch: (w.max(1) as u32) * 4,
        SysMemSlicePitch: 0,
    };
    let mut tex = None;
    unsafe {
        device
            .CreateTexture2D(&desc, Some(&init), Some(&mut tex))
            .ok()?;
    }
    tex
}

pub fn present_bits(
    d3d: &ID3D11Device,
    context: &ID3D11DeviceContext,
    factory: &IDXGIFactory2,
    w: i32,
    h: i32,
    pixels: &[u8],
) -> Option<IDXGISwapChain1> {
    let tex = upload_texture(d3d, w, h, pixels)?;
    let desc = DXGI_SWAP_CHAIN_DESC1 {
        Width: w.max(1) as u32,
        Height: h.max(1) as u32,
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
    let swapchain = unsafe {
        factory
            .CreateSwapChainForComposition(d3d, &desc, None)
            .ok()?
    };
    let back: ID3D11Texture2D = unsafe { swapchain.GetBuffer(0).ok()? };
    unsafe {
        context.CopyResource(&back, &tex);
        let _ = swapchain.Present(0, DXGI_PRESENT(0));
    }
    Some(swapchain)
}
