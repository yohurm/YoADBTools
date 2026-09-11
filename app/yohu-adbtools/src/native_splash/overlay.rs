//! L2：冻结 HWND 快照，作为 DComp Visual 的 content。
//! overlay HWND 外框固定；运动只改 Offset / Scale / Opacity。禁止 UpdateLayeredWindow，禁止改 HWND 尺寸。
//! Shared fill 与快照底只消费启动画布 BGRA，禁止从快照角点猜色。

use windows::core::{w, Interface};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
    D3D11_BIND_SHADER_RESOURCE, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION,
    D3D11_SUBRESOURCE_DATA, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT,
};
use windows::Win32::Graphics::DirectComposition::{
    DCompositionCreateDevice, IDCompositionDevice, IDCompositionEffectGroup,
    IDCompositionScaleTransform, IDCompositionTarget, IDCompositionVisual,
};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_ALPHA_MODE_PREMULTIPLIED, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC,
};
use windows::Win32::Graphics::Dxgi::{
    IDXGIAdapter, IDXGIDevice, IDXGIFactory2, IDXGISwapChain1, DXGI_PRESENT, DXGI_SCALING_STRETCH,
    DXGI_SWAP_CHAIN_DESC1, DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL, DXGI_USAGE_RENDER_TARGET_OUTPUT,
};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC,
    SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, RGBQUAD, SRCCOPY,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassExW, ShowWindow, CS_HREDRAW,
    CS_VREDRAW, SW_SHOWNOACTIVATE, WNDCLASSEXW, WS_EX_NOACTIVATE, WS_EX_NOREDIRECTIONBITMAP,
    WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

use super::overlay_geom::{center_offset, visual_pose};
use yohu_motion::{eased_anim, rect_height, rect_width};

const CLASS: windows::core::PCWSTR = w!("YohuMotionOverlay");
/// DComp Scale 原点在内容左上。2×2 色块放大成画布，不是 HWND 尺寸。
const FILL_CONTENT: i32 = 2;

pub enum OverlayKind {
    Shared,
    Exit,
}

pub struct Snapshot {
    pixels: Vec<u8>,
    pub w: i32,
    pub h: i32,
}

pub struct Overlay {
    hwnd: HWND,
    d3d: Option<ID3D11Device>,
    context: Option<ID3D11DeviceContext>,
    fill_chain: Option<IDXGISwapChain1>,
    brand_chain: Option<IDXGISwapChain1>,
    device: Option<IDCompositionDevice>,
    target: Option<IDCompositionTarget>,
    root: Option<IDCompositionVisual>,
    fill: Option<IDCompositionVisual>,
    fill_scale: Option<IDCompositionScaleTransform>,
    brand: Option<IDCompositionVisual>,
    brand_scale: Option<IDCompositionScaleTransform>,
    effect: Option<IDCompositionEffectGroup>,
    w: i32,
    h: i32,
    content_w: i32,
    content_h: i32,
}

impl Drop for Overlay {
    fn drop(&mut self) {
        self.brand_scale.take();
        self.brand.take();
        self.fill_scale.take();
        self.fill.take();
        self.effect.take();
        self.root.take();
        self.target.take();
        self.device.take();
        self.brand_chain.take();
        self.fill_chain.take();
        self.context.take();
        self.d3d.take();
        unsafe {
            let _ = DestroyWindow(self.hwnd);
        }
    }
}

impl Overlay {
    pub fn hwnd(&self) -> HWND {
        self.hwnd
    }

    pub fn reveal(&self) {
        unsafe {
            let _ = ShowWindow(self.hwnd, SW_SHOWNOACTIVATE);
        }
    }

    pub fn client(&self) -> RECT {
        RECT {
            left: 0,
            top: 0,
            right: self.w,
            bottom: self.h,
        }
    }

    /// 异屏：只播品牌快照（无 fill 层）。
    pub fn pose_exit(&self, dest: RECT, opacity: f32) {
        self.pose_brand_scaled(dest);
        self.set_opacity(opacity);
    }

    pub fn morph_exit(
        &self,
        from: RECT,
        to: RECT,
        opacity_from: f32,
        opacity_to: f32,
        ms: u64,
        ease: fn(f64) -> f64,
    ) {
        self.morph_brand_scaled(from, to, ms, ease);
        self.morph_opacity(opacity_from, opacity_to, ms, ease);
    }

    /// 同屏共享容器：画布色块放大，品牌快照 1:1 钉在中心。
    pub fn pose_shared(&self, dest: RECT, opacity: f32) {
        self.pose_fill(dest);
        self.pose_brand_centered(dest);
        self.set_opacity(opacity);
    }

    pub fn morph_shared(
        &self,
        from: RECT,
        to: RECT,
        opacity_from: f32,
        opacity_to: f32,
        ms: u64,
        ease: fn(f64) -> f64,
    ) {
        self.morph_fill(from, to, ms, ease);
        self.morph_brand_centered(from, to, ms, ease);
        self.morph_opacity(opacity_from, opacity_to, ms, ease);
    }

    fn pose_fill(&self, dest: RECT) {
        let Some(visual) = self.fill.as_ref() else {
            return;
        };
        let Some(scale) = self.fill_scale.as_ref() else {
            return;
        };
        let (ox, oy, sx, sy) = visual_pose(dest, FILL_CONTENT, FILL_CONTENT);
        unsafe {
            let _ = visual.SetOffsetX2(ox);
            let _ = visual.SetOffsetY2(oy);
            let _ = scale.SetScaleX2(sx);
            let _ = scale.SetScaleY2(sy);
        }
        self.commit();
    }

    fn pose_brand_scaled(&self, dest: RECT) {
        let Some(visual) = self.brand.as_ref() else {
            return;
        };
        let Some(scale) = self.brand_scale.as_ref() else {
            return;
        };
        let (ox, oy, sx, sy) = visual_pose(dest, self.content_w, self.content_h);
        unsafe {
            let _ = visual.SetOffsetX2(ox);
            let _ = visual.SetOffsetY2(oy);
            let _ = scale.SetScaleX2(sx);
            let _ = scale.SetScaleY2(sy);
        }
        self.commit();
    }

    fn pose_brand_centered(&self, dest: RECT) {
        let Some(visual) = self.brand.as_ref() else {
            return;
        };
        let Some(scale) = self.brand_scale.as_ref() else {
            return;
        };
        let (ox, oy) = center_offset(dest, self.content_w, self.content_h);
        unsafe {
            let _ = visual.SetOffsetX2(ox);
            let _ = visual.SetOffsetY2(oy);
            let _ = scale.SetScaleX2(1.0);
            let _ = scale.SetScaleY2(1.0);
        }
        self.commit();
    }

    fn morph_fill(&self, from: RECT, to: RECT, ms: u64, ease: fn(f64) -> f64) {
        let Some(device) = self.device.as_ref() else {
            return;
        };
        let Some(visual) = self.fill.as_ref() else {
            return;
        };
        let Some(scale) = self.fill_scale.as_ref() else {
            return;
        };
        let (ox0, oy0, sx0, sy0) = visual_pose(from, FILL_CONTENT, FILL_CONTENT);
        let (ox1, oy1, sx1, sy1) = visual_pose(to, FILL_CONTENT, FILL_CONTENT);
        apply_pose_anim(
            device,
            visual,
            scale,
            (ox0, oy0, sx0, sy0),
            (ox1, oy1, sx1, sy1),
            ms,
            ease,
        );
        self.commit();
    }

    fn morph_brand_scaled(&self, from: RECT, to: RECT, ms: u64, ease: fn(f64) -> f64) {
        let Some(device) = self.device.as_ref() else {
            return;
        };
        let Some(visual) = self.brand.as_ref() else {
            return;
        };
        let Some(scale) = self.brand_scale.as_ref() else {
            return;
        };
        let (ox0, oy0, sx0, sy0) = visual_pose(from, self.content_w, self.content_h);
        let (ox1, oy1, sx1, sy1) = visual_pose(to, self.content_w, self.content_h);
        apply_pose_anim(
            device,
            visual,
            scale,
            (ox0, oy0, sx0, sy0),
            (ox1, oy1, sx1, sy1),
            ms,
            ease,
        );
        self.commit();
    }

    fn morph_brand_centered(&self, from: RECT, to: RECT, ms: u64, ease: fn(f64) -> f64) {
        let Some(device) = self.device.as_ref() else {
            return;
        };
        let Some(visual) = self.brand.as_ref() else {
            return;
        };
        let Some(scale) = self.brand_scale.as_ref() else {
            return;
        };
        let (ox0, oy0) = center_offset(from, self.content_w, self.content_h);
        let (ox1, oy1) = center_offset(to, self.content_w, self.content_h);
        apply_pose_anim(
            device,
            visual,
            scale,
            (ox0, oy0, 1.0, 1.0),
            (ox1, oy1, 1.0, 1.0),
            ms,
            ease,
        );
        self.commit();
    }

    fn set_opacity(&self, opacity: f32) {
        let Some(effect) = self.effect.as_ref() else {
            return;
        };
        unsafe {
            let _ = effect.SetOpacity2(opacity.clamp(0.0, 1.0));
        }
        self.commit();
    }

    fn morph_opacity(&self, from: f32, to: f32, ms: u64, ease: fn(f64) -> f64) {
        let Some(device) = self.device.as_ref() else {
            return;
        };
        let Some(effect) = self.effect.as_ref() else {
            return;
        };
        let o0 = from.clamp(0.0, 1.0);
        let o1 = to.clamp(0.0, 1.0);
        if let Some(anim) = eased_anim(device, o0, o1, ms, ease) {
            unsafe {
                let _ = effect.SetOpacity(&anim);
            }
        } else {
            unsafe {
                let _ = effect.SetOpacity2(o1);
            }
        }
        self.commit();
    }

    fn commit(&self) {
        if let Some(device) = self.device.as_ref() {
            unsafe {
                let _ = device.Commit();
            }
        }
    }
}

pub fn capture(hwnd: HWND, rect: RECT, canvas: [u8; 4]) -> Option<Snapshot> {
    let w = rect_width(rect).max(1);
    let h = rect_height(rect).max(1);
    unsafe {
        let (dc, bmp, old, bits) = dib(w, h)?;
        fill_dib(bits, w, h, canvas);
        let client_dc = GetDC(Some(hwnd));
        if client_dc.is_invalid() {
            SelectObject(dc, old);
            let _ = DeleteObject(bmp.into());
            let _ = DeleteDC(dc);
            return None;
        }
        let _ = BitBlt(dc, 0, 0, w, h, Some(client_dc), 0, 0, SRCCOPY);
        ReleaseDC(Some(hwnd), client_dc);
        opaque_alpha(bits, w, h);
        let n = (w as usize) * (h as usize) * 4;
        let mut pixels = vec![0u8; n];
        if !bits.is_null() {
            std::ptr::copy_nonoverlapping(bits, pixels.as_mut_ptr(), n);
        }
        SelectObject(dc, old);
        let _ = DeleteObject(bmp.into());
        let _ = DeleteDC(dc);
        Some(Snapshot { pixels, w, h })
    }
}

pub fn open(screen: RECT, snap: &Snapshot, kind: OverlayKind, canvas: [u8; 4]) -> Option<Overlay> {
    let w = rect_width(screen).max(1);
    let h = rect_height(screen).max(1);
    let hwnd = create_hwnd(screen.left, screen.top, w, h)?;
    match attach(hwnd, w, h, snap, kind, canvas) {
        Some(overlay) => Some(overlay),
        None => {
            unsafe {
                let _ = DestroyWindow(hwnd);
            }
            None
        }
    }
}

fn attach(
    hwnd: HWND,
    w: i32,
    h: i32,
    snap: &Snapshot,
    kind: OverlayKind,
    canvas: [u8; 4],
) -> Option<Overlay> {
    let content_w = snap.w.max(1);
    let content_h = snap.h.max(1);
    let (d3d, context) = create_device()?;
    let dxgi: IDXGIDevice = d3d.cast().ok()?;
    let adapter: IDXGIAdapter = unsafe { dxgi.GetAdapter().ok()? };
    let factory: IDXGIFactory2 = unsafe { adapter.GetParent().ok()? };
    let brand_chain = present_bits(&d3d, &context, &factory, content_w, content_h, &snap.pixels)?;
    let device: IDCompositionDevice = unsafe { DCompositionCreateDevice(&dxgi).ok()? };
    let target = unsafe { device.CreateTargetForHwnd(hwnd, true).ok()? };
    let root = unsafe { device.CreateVisual().ok()? };
    let brand = unsafe { device.CreateVisual().ok()? };
    let brand_scale = unsafe { device.CreateScaleTransform().ok()? };
    let effect = unsafe { device.CreateEffectGroup().ok()? };
    let (fill_chain, fill, fill_scale) = match kind {
        OverlayKind::Shared => {
            let fill_chain = present_bits(
                &d3d,
                &context,
                &factory,
                FILL_CONTENT,
                FILL_CONTENT,
                &fill_tile(canvas),
            )?;
            let fill = unsafe { device.CreateVisual().ok()? };
            let fill_scale = unsafe { device.CreateScaleTransform().ok()? };
            unsafe {
                fill.SetContent(&fill_chain).ok()?;
                fill.SetTransform(&fill_scale).ok()?;
            }
            (Some(fill_chain), Some(fill), Some(fill_scale))
        }
        OverlayKind::Exit => (None, None, None),
    };
    unsafe {
        brand.SetContent(&brand_chain).ok()?;
        brand.SetTransform(&brand_scale).ok()?;
        root.SetEffect(&effect).ok()?;
        if let (Some(fill), Some(_)) = (fill.as_ref(), fill_scale.as_ref()) {
            root.AddVisual(fill, false, None).ok()?;
            root.AddVisual(&brand, true, Some(fill)).ok()?;
        } else {
            root.AddVisual(&brand, false, None).ok()?;
        }
        target.SetRoot(&root).ok()?;
        device.Commit().ok()?;
    }
    Some(Overlay {
        hwnd,
        d3d: Some(d3d),
        context: Some(context),
        fill_chain,
        brand_chain: Some(brand_chain),
        device: Some(device),
        target: Some(target),
        root: Some(root),
        fill,
        fill_scale,
        brand: Some(brand),
        brand_scale: Some(brand_scale),
        effect: Some(effect),
        w,
        h,
        content_w,
        content_h,
    })
}

fn create_hwnd(x: i32, y: i32, w: i32, h: i32) -> Option<HWND> {
    unsafe {
        let hinstance = GetModuleHandleW(None).ok()?;
        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wnd_proc),
            hInstance: hinstance.into(),
            lpszClassName: CLASS,
            ..Default::default()
        };
        let _ = RegisterClassExW(&wc);
        CreateWindowExW(
            WS_EX_NOREDIRECTIONBITMAP | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            CLASS,
            w!(""),
            WS_POPUP,
            x,
            y,
            w,
            h,
            None,
            None,
            Some(hinstance.into()),
            None,
        )
        .ok()
    }
}

fn create_device() -> Option<(ID3D11Device, ID3D11DeviceContext)> {
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

fn present_bits(
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

fn fill_tile(canvas: [u8; 4]) -> [u8; 16] {
    let mut out = [0u8; 16];
    for i in 0..4 {
        out[i * 4..i * 4 + 4].copy_from_slice(&canvas);
    }
    out
}

fn fill_dib(bits: *mut u8, w: i32, h: i32, canvas: [u8; 4]) {
    if bits.is_null() {
        return;
    }
    let n = (w as usize) * (h as usize);
    unsafe {
        for i in 0..n {
            std::ptr::copy_nonoverlapping(canvas.as_ptr(), bits.add(i * 4), 4);
        }
    }
}

fn apply_pose_anim(
    device: &IDCompositionDevice,
    visual: &IDCompositionVisual,
    scale: &IDCompositionScaleTransform,
    from: (f32, f32, f32, f32),
    to: (f32, f32, f32, f32),
    ms: u64,
    ease: fn(f64) -> f64,
) {
    let (ox0, oy0, sx0, sy0) = from;
    let (ox1, oy1, sx1, sy1) = to;
    let ax = eased_anim(device, ox0, ox1, ms, ease);
    let ay = eased_anim(device, oy0, oy1, ms, ease);
    let asx = eased_anim(device, sx0, sx1, ms, ease);
    let asy = eased_anim(device, sy0, sy1, ms, ease);
    unsafe {
        if let Some(a) = ax.as_ref() {
            let _ = visual.SetOffsetX(a);
        } else {
            let _ = visual.SetOffsetX2(ox1);
        }
        if let Some(a) = ay.as_ref() {
            let _ = visual.SetOffsetY(a);
        } else {
            let _ = visual.SetOffsetY2(oy1);
        }
        if let Some(a) = asx.as_ref() {
            let _ = scale.SetScaleX(a);
        } else {
            let _ = scale.SetScaleX2(sx1);
        }
        if let Some(a) = asy.as_ref() {
            let _ = scale.SetScaleY(a);
        } else {
            let _ = scale.SetScaleY2(sy1);
        }
    }
}

fn dib(
    w: i32,
    h: i32,
) -> Option<(
    windows::Win32::Graphics::Gdi::HDC,
    windows::Win32::Graphics::Gdi::HBITMAP,
    windows::Win32::Graphics::Gdi::HGDIOBJ,
    *mut u8,
)> {
    unsafe {
        let dc = CreateCompatibleDC(None);
        if dc.is_invalid() {
            return None;
        }
        let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
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
        let bmp = CreateDIBSection(Some(dc), &info, DIB_RGB_COLORS, &mut bits, None, 0).ok()?;
        let old = SelectObject(dc, bmp.into());
        Some((dc, bmp, old, bits.cast()))
    }
}

fn opaque_alpha(bits: *mut u8, w: i32, h: i32) {
    if bits.is_null() {
        return;
    }
    let n = (w as usize) * (h as usize);
    unsafe {
        for i in 0..n {
            *bits.add(i * 4 + 3) = 255;
        }
    }
}

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::window_boot::canvas_bgra;

    #[test]
    fn shared_fill_is_boot_canvas_not_snapshot_corner() {
        let light = fill_tile(canvas_bgra(false));
        assert_eq!(&light[0..4], &[0xF5, 0xF3, 0xF1, 255]);
        assert_eq!(&light[12..16], &[0xF5, 0xF3, 0xF1, 255]);
        assert_ne!(&light[0..4], &[0, 0, 0, 255]);
        let dark = fill_tile(canvas_bgra(true));
        assert_eq!(&dark[0..4], &[0, 0, 0, 255]);
    }
}
