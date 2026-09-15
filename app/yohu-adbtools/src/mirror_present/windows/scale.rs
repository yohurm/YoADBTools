//! Scale：RGB dest 取样。不改 dest、不转色、不算 contain。

use windows::core::{s, Result as WinResult};
use windows::Win32::Graphics::Direct3D::Fxc::D3DCompile;
use windows::Win32::Graphics::Direct3D::D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST;
use windows::Win32::Graphics::Direct3D11::{
    ID3D11Buffer, ID3D11Device, ID3D11DeviceContext, ID3D11PixelShader, ID3D11RenderTargetView,
    ID3D11SamplerState, ID3D11ShaderResourceView, ID3D11VertexShader, D3D11_BIND_CONSTANT_BUFFER,
    D3D11_BUFFER_DESC, D3D11_FILTER_MIN_MAG_MIP_LINEAR, D3D11_FILTER_MIN_MAG_MIP_POINT,
    D3D11_SAMPLER_DESC, D3D11_USAGE_DEFAULT, D3D11_VIEWPORT,
};

use super::super::scale::{scale_kernel, Letterbox, ScaleKernel};

const VS: &str = r#"
struct VSOut { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
VSOut main(uint id : SV_VertexID) {
  VSOut o;
  float2 uv = float2((id << 1) & 2, id & 2);
  o.pos = float4(uv * float2(2, -2) + float2(-1, 1), 0, 1);
  o.uv = uv;
  return o;
}
"#;

const PS_RGB: &str = r#"
cbuffer Scale : register(b0) {
  float src_w;
  float src_h;
  float dest_w;
  float dest_h;
};
Texture2D tex : register(t0);
SamplerState samp : register(s0);
float4 main(float4 pos : SV_POSITION, float2 uv : TEXCOORD0) : SV_TARGET {
  float2 scale = float2(src_w / max(dest_w, 1.0), src_h / max(dest_h, 1.0));
  if (scale.x <= 1.01 && scale.y <= 1.01) {
    return tex.Sample(samp, uv);
  }
  float2 footprint = float2(1.0 / max(dest_w, 1.0), 1.0 / max(dest_h, 1.0));
  float4 acc = 0;
  [unroll] for (int y = 0; y < 3; y++) {
    [unroll] for (int x = 0; x < 3; x++) {
      float2 o = (float2(x, y) + 0.5) / 3.0 - 0.5;
      acc += tex.Sample(samp, uv + o * footprint);
    }
  }
  return acc / 9.0;
}
"#;

#[repr(C)]
#[derive(Clone, Copy)]
struct ScaleCb {
    src_w: f32,
    src_h: f32,
    dest_w: f32,
    dest_h: f32,
}

pub struct RgbScale {
    vs: ID3D11VertexShader,
    ps_rgb: ID3D11PixelShader,
    samp_linear: ID3D11SamplerState,
    samp_point: ID3D11SamplerState,
    scale_cb: ID3D11Buffer,
}

impl RgbScale {
    pub fn new(device: &ID3D11Device) -> WinResult<Self> {
        Ok(Self {
            vs: compile_vs(device)?,
            ps_rgb: compile_ps(device, PS_RGB)?,
            samp_linear: sampler(device, false)?,
            samp_point: sampler(device, true)?,
            scale_cb: scale_cbuffer(device)?,
        })
    }

    pub fn draw(
        &self,
        context: &ID3D11DeviceContext,
        rtv: &ID3D11RenderTargetView,
        srv: &ID3D11ShaderResourceView,
        dest: Letterbox,
        src: (u32, u32),
        clear: [f32; 4],
    ) -> WinResult<()> {
        let (src_w, src_h) = src;
        let kernel = scale_kernel(src_w, src_h, dest);
        let cb = ScaleCb {
            src_w: src_w.max(1) as f32,
            src_h: src_h.max(1) as f32,
            dest_w: dest.width.max(1) as f32,
            dest_h: dest.height.max(1) as f32,
        };
        let samp = match kernel {
            ScaleKernel::Area => &self.samp_linear,
            ScaleKernel::Nearest => &self.samp_point,
        };
        unsafe {
            context.UpdateSubresource(
                &self.scale_cb,
                0,
                None,
                (&cb as *const ScaleCb).cast(),
                0,
                0,
            );
            context.ClearRenderTargetView(rtv, &clear);
            context.OMSetRenderTargets(Some(&[Some(rtv.clone())]), None);
            context.RSSetViewports(Some(&[D3D11_VIEWPORT {
                TopLeftX: dest.x as f32,
                TopLeftY: dest.y as f32,
                Width: dest.width.max(1) as f32,
                Height: dest.height.max(1) as f32,
                MinDepth: 0.0,
                MaxDepth: 1.0,
            }]));
            context.VSSetShader(&self.vs, None);
            context.PSSetShader(&self.ps_rgb, None);
            context.PSSetConstantBuffers(0, Some(&[Some(self.scale_cb.clone())]));
            context.PSSetShaderResources(0, Some(&[Some(srv.clone())]));
            context.PSSetSamplers(0, Some(&[Some(samp.clone())]));
            context.IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            context.Draw(3, 0);
            context.PSSetShaderResources(0, Some(&[None]));
        }
        Ok(())
    }
}

fn compile_vs(device: &ID3D11Device) -> WinResult<ID3D11VertexShader> {
    let blob = compile(VS, true)?;
    let mut vs = None;
    unsafe {
        device.CreateVertexShader(blob_bytes(&blob), None, Some(&mut vs))?;
    }
    vs.ok_or_else(windows::core::Error::from_win32)
}

fn compile_ps(device: &ID3D11Device, src: &str) -> WinResult<ID3D11PixelShader> {
    let blob = compile(src, false)?;
    let mut ps = None;
    unsafe {
        device.CreatePixelShader(blob_bytes(&blob), None, Some(&mut ps))?;
    }
    ps.ok_or_else(windows::core::Error::from_win32)
}

fn compile(src: &str, vs: bool) -> WinResult<windows::Win32::Graphics::Direct3D::ID3DBlob> {
    let mut blob = None;
    let mut err = None;
    let hr = unsafe {
        D3DCompile(
            src.as_ptr() as *const _,
            src.len(),
            windows::core::PCSTR::null(),
            None,
            None,
            s!("main"),
            if vs { s!("vs_5_0") } else { s!("ps_5_0") },
            0,
            0,
            &mut blob,
            Some(&mut err),
        )
    };
    if hr.is_err() {
        if let Some(err) = err {
            let msg = unsafe {
                std::slice::from_raw_parts(err.GetBufferPointer() as *const u8, err.GetBufferSize())
            };
            tracing::error!("HLSL: {}", String::from_utf8_lossy(msg));
        }
        hr?;
    }
    blob.ok_or_else(windows::core::Error::from_win32)
}

fn blob_bytes(blob: &windows::Win32::Graphics::Direct3D::ID3DBlob) -> &[u8] {
    unsafe { std::slice::from_raw_parts(blob.GetBufferPointer() as *const u8, blob.GetBufferSize()) }
}

fn sampler(device: &ID3D11Device, point: bool) -> WinResult<ID3D11SamplerState> {
    let desc = D3D11_SAMPLER_DESC {
        Filter: if point {
            D3D11_FILTER_MIN_MAG_MIP_POINT
        } else {
            D3D11_FILTER_MIN_MAG_MIP_LINEAR
        },
        AddressU: windows::Win32::Graphics::Direct3D11::D3D11_TEXTURE_ADDRESS_CLAMP,
        AddressV: windows::Win32::Graphics::Direct3D11::D3D11_TEXTURE_ADDRESS_CLAMP,
        AddressW: windows::Win32::Graphics::Direct3D11::D3D11_TEXTURE_ADDRESS_CLAMP,
        MipLODBias: 0.0,
        MaxAnisotropy: 1,
        ComparisonFunc: windows::Win32::Graphics::Direct3D11::D3D11_COMPARISON_NEVER,
        BorderColor: [0.0; 4],
        MinLOD: 0.0,
        MaxLOD: f32::MAX,
    };
    let mut samp = None;
    unsafe {
        device.CreateSamplerState(&desc, Some(&mut samp))?;
    }
    samp.ok_or_else(windows::core::Error::from_win32)
}

fn scale_cbuffer(device: &ID3D11Device) -> WinResult<ID3D11Buffer> {
    let desc = D3D11_BUFFER_DESC {
        ByteWidth: std::mem::size_of::<ScaleCb>() as u32,
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: D3D11_BIND_CONSTANT_BUFFER.0 as u32,
        CPUAccessFlags: 0,
        MiscFlags: 0,
        StructureByteStride: 0,
    };
    let mut buf = None;
    unsafe {
        device.CreateBuffer(&desc, None, Some(&mut buf))?;
    }
    buf.ok_or_else(windows::core::Error::from_win32)
}
