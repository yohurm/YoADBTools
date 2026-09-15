//! D3D11 纹理创建。Convert / Present 共用，不含核与 VP。

use windows::core::Result as WinResult;
use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11Texture2D, D3D11_TEXTURE2D_DESC};

pub fn even_px(n: u32) -> u32 {
    n.max(2) & !1
}

pub fn create_texture(
    device: &ID3D11Device,
    desc: &D3D11_TEXTURE2D_DESC,
) -> WinResult<ID3D11Texture2D> {
    let mut tex = None;
    unsafe {
        device.CreateTexture2D(desc, None, Some(&mut tex))?;
    }
    tex.ok_or_else(windows::core::Error::from_win32)
}
