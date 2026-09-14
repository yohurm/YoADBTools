//! DComp overlay：fill（画布 token）+ brand（BootFrame）+ root clip。
//! overlay HWND 外框固定；运动只改 Offset / Scale / Opacity / clip。
//! 同屏铺满 clip 终点是 0：目标 HWND 每个像素不透明。主窗 DWM 圆角揭窗后才出现。
//! 禁止 UpdateLayeredWindow，禁止改 HWND 尺寸，禁止从 HWND 抓像素。
//! `NOREDIRECTIONBITMAP` 窗：DONOTROUND + 整窗 extend frame；禁止再交给 DWM 圆角。

use std::ffi::c_void;

use windows::core::{w, Interface, BOOL};
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
    IDCompositionRectangleClip, IDCompositionScaleTransform, IDCompositionTarget,
    IDCompositionVisual,
};
use windows::Win32::Graphics::Dwm::{
    DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_ALPHA_MODE_PREMULTIPLIED, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC,
};
use windows::Win32::Graphics::Dxgi::{
    IDXGIAdapter, IDXGIDevice, IDXGIFactory2, IDXGISwapChain1, DXGI_PRESENT, DXGI_SCALING_STRETCH,
    DXGI_SWAP_CHAIN_DESC1, DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL, DXGI_USAGE_RENDER_TARGET_OUTPUT,
};
use windows::Win32::Graphics::Gdi::{BeginPaint, EndPaint, PAINTSTRUCT};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Controls::MARGINS;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassExW, ShowWindow, CS_HREDRAW,
    CS_VREDRAW, SW_SHOWNOACTIVATE, WM_ERASEBKGND, WM_PAINT, WNDCLASSEXW, WS_EX_NOACTIVATE,
    WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
};

use super::overlay_geom::{center_offset, visual_pose};
use super::surface::{fill_tile, BootSurface, FILL_CONTENT};
use yohu_motion::{eased_anim, rect_height, rect_width};

const CLASS: windows::core::PCWSTR = w!("YohuMotionOverlay");

pub enum OverlayKind {
    Shared,
    Exit,
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
    clip: Option<IDCompositionRectangleClip>,
    effect: Option<IDCompositionEffectGroup>,
    w: i32,
    h: i32,
    content_w: i32,
    content_h: i32,
    radius_from: f32,
    radius_to: f32,
}

impl Drop for Overlay {
    fn drop(&mut self) {
        self.brand_scale.take();
        self.brand.take();
        self.fill_scale.take();
        self.fill.take();
        self.clip.take();
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

    pub fn pose_exit(&self, dest: RECT, opacity: f32) {
        self.pose_brand_scaled(dest);
        self.pose_clip(dest, self.radius_from);
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
        self.morph_clip(from, to, self.radius_from, self.radius_to, ms, ease);
        self.morph_opacity(opacity_from, opacity_to, ms, ease);
    }

    pub fn pose_shared(&self, dest: RECT, opacity: f32) {
        self.pose_fill(dest);
        self.pose_brand_centered(dest);
        self.pose_clip(dest, self.radius_from);
        self.set_opacity(opacity);
    }

    pub fn morph_shared(&self, from: RECT, to: RECT, ms: u64, ease: fn(f64) -> f64) {
        self.morph_fill(from, to, ms, ease);
        self.morph_brand_centered(from, to, ms, ease);
        self.morph_clip(from, to, self.radius_from, self.radius_to, ms, ease);
    }

    pub fn fade_out(&self, ms: u64, ease: fn(f64) -> f64) {
        self.morph_opacity(1.0, 0.0, ms, ease);
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

    fn pose_clip(&self, dest: RECT, radius: f32) {
        let Some(clip) = self.clip.as_ref() else {
            return;
        };
        unsafe {
            let _ = clip.SetLeft2(dest.left as f32);
            let _ = clip.SetTop2(dest.top as f32);
            let _ = clip.SetRight2(dest.right as f32);
            let _ = clip.SetBottom2(dest.bottom as f32);
        }
        apply_clip_radius(clip, radius);
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

    fn morph_clip(
        &self,
        from: RECT,
        to: RECT,
        radius_from: f32,
        radius_to: f32,
        ms: u64,
        ease: fn(f64) -> f64,
    ) {
        let Some(device) = self.device.as_ref() else {
            return;
        };
        let Some(clip) = self.clip.as_ref() else {
            return;
        };
        let edges = [
            (from.left as f32, to.left as f32),
            (from.top as f32, to.top as f32),
            (from.right as f32, to.right as f32),
            (from.bottom as f32, to.bottom as f32),
        ];
        let edge_anims: [_; 4] =
            std::array::from_fn(|i| eased_anim(device, edges[i].0, edges[i].1, ms, ease));
        let radius = eased_anim(device, radius_from, radius_to, ms, ease);
        unsafe {
            if let Some(a) = edge_anims[0].as_ref() {
                let _ = clip.SetLeft(a);
            } else {
                let _ = clip.SetLeft2(to.left as f32);
            }
            if let Some(a) = edge_anims[1].as_ref() {
                let _ = clip.SetTop(a);
            } else {
                let _ = clip.SetTop2(to.top as f32);
            }
            if let Some(a) = edge_anims[2].as_ref() {
                let _ = clip.SetRight(a);
            } else {
                let _ = clip.SetRight2(to.right as f32);
            }
            if let Some(a) = edge_anims[3].as_ref() {
                let _ = clip.SetBottom(a);
            } else {
                let _ = clip.SetBottom2(to.bottom as f32);
            }
            if let Some(a) = radius.as_ref() {
                let _ = clip.SetTopLeftRadiusX(a);
                let _ = clip.SetTopLeftRadiusY(a);
                let _ = clip.SetTopRightRadiusX(a);
                let _ = clip.SetTopRightRadiusY(a);
                let _ = clip.SetBottomLeftRadiusX(a);
                let _ = clip.SetBottomLeftRadiusY(a);
                let _ = clip.SetBottomRightRadiusX(a);
                let _ = clip.SetBottomRightRadiusY(a);
            } else {
                apply_clip_radius(clip, radius_to);
            }
        }
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

pub fn open(screen: RECT, surface: &BootSurface, kind: OverlayKind) -> Option<Overlay> {
    let w = rect_width(screen).max(1);
    let h = rect_height(screen).max(1);
    let hwnd = create_hwnd(screen.left, screen.top, w, h)?;
    match attach(hwnd, w, h, surface, kind) {
        Some(overlay) => Some(overlay),
        None => {
            unsafe {
                let _ = DestroyWindow(hwnd);
            }
            None
        }
    }
}

fn attach(hwnd: HWND, w: i32, h: i32, surface: &BootSurface, kind: OverlayKind) -> Option<Overlay> {
    let snap = &surface.frame;
    let content_w = snap.w.max(1);
    let content_h = snap.h.max(1);
    let (radius_from, radius_to) = match kind {
        OverlayKind::Shared => surface.shared_clip(),
        OverlayKind::Exit => surface.exit_clip(),
    };
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
    let clip = unsafe { device.CreateRectangleClip().ok()? };
    let effect = unsafe { device.CreateEffectGroup().ok()? };
    let (fill_chain, fill, fill_scale) = match kind {
        OverlayKind::Shared => {
            let fill_chain = present_bits(
                &d3d,
                &context,
                &factory,
                FILL_CONTENT,
                FILL_CONTENT,
                &fill_tile(surface.canvas),
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
        root.SetClip(&clip).ok()?;
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
        clip: Some(clip),
        effect: Some(effect),
        w,
        h,
        content_w,
        content_h,
        radius_from,
        radius_to,
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
        let hwnd = CreateWindowExW(
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
        .ok()?;
        configure_overlay_hwnd(hwnd);
        Some(hwnd)
    }
}

fn configure_overlay_hwnd(hwnd: HWND) {
    unsafe {
        let pref = DWMWCP_DONOTROUND;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &pref as *const _ as *const c_void,
            std::mem::size_of_val(&pref) as u32,
        );
        let disable = BOOL(1);
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            &disable as *const _ as *const c_void,
            std::mem::size_of_val(&disable) as u32,
        );
        let glass = MARGINS {
            cxLeftWidth: -1,
            cxRightWidth: -1,
            cyTopHeight: -1,
            cyBottomHeight: -1,
        };
        let _ = DwmExtendFrameIntoClientArea(hwnd, &glass);
    }
}

fn apply_clip_radius(clip: &IDCompositionRectangleClip, r: f32) {
    unsafe {
        let _ = clip.SetTopLeftRadiusX2(r);
        let _ = clip.SetTopLeftRadiusY2(r);
        let _ = clip.SetTopRightRadiusX2(r);
        let _ = clip.SetTopRightRadiusY2(r);
        let _ = clip.SetBottomLeftRadiusX2(r);
        let _ = clip.SetBottomLeftRadiusY2(r);
        let _ = clip.SetBottomRightRadiusX2(r);
        let _ = clip.SetBottomRightRadiusY2(r);
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

unsafe extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    match msg {
        WM_ERASEBKGND => windows::Win32::Foundation::LRESULT(1),
        WM_PAINT => unsafe {
            let mut ps = PAINTSTRUCT::default();
            let _ = BeginPaint(hwnd, &mut ps);
            let _ = EndPaint(hwnd, &ps);
            windows::Win32::Foundation::LRESULT(0)
        },
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}
