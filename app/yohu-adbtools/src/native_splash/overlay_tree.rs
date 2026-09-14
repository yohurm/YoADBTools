//! overlay DComp 树：fill / brand / clip / opacity。运动只改 Offset / Scale / Opacity / clip。

use windows::core::Interface;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11DeviceContext};
use windows::Win32::Graphics::DirectComposition::{
    DCompositionCreateDevice, IDCompositionDevice, IDCompositionEffectGroup,
    IDCompositionRectangleClip, IDCompositionScaleTransform, IDCompositionTarget,
    IDCompositionVisual,
};
use windows::Win32::Graphics::Dxgi::{IDXGIAdapter, IDXGIDevice, IDXGIFactory2, IDXGISwapChain1};
use windows::Win32::UI::WindowsAndMessaging::{DestroyWindow, ShowWindow, SW_SHOWNOACTIVATE};

use super::overlay_geom::{center_offset, visual_pose};
use super::overlay_swapchain::{create_device, present_bits};
use super::surface::{fill_tile, BootSurface, FILL_CONTENT};
use yohu_motion::{eased_anim, MotionSpec};

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
        spec: MotionSpec,
    ) {
        self.morph_brand_scaled(from, to, spec);
        self.morph_clip(from, to, self.radius_from, self.radius_to, spec);
        self.morph_opacity(opacity_from, opacity_to, spec);
    }

    pub fn pose_shared(&self, dest: RECT, opacity: f32) {
        self.pose_fill(dest);
        self.pose_brand_centered(dest);
        self.pose_clip(dest, self.radius_from);
        self.set_opacity(opacity);
    }

    pub fn morph_shared(&self, from: RECT, to: RECT, spec: MotionSpec) {
        self.morph_fill(from, to, spec);
        self.morph_brand_centered(from, to, spec);
        self.morph_clip(from, to, self.radius_from, self.radius_to, spec);
    }

    pub fn fade_out(&self, spec: MotionSpec) {
        self.morph_opacity(1.0, 0.0, spec);
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

    fn morph_fill(&self, from: RECT, to: RECT, spec: MotionSpec) {
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
            spec,
        );
        self.commit();
    }

    fn morph_brand_scaled(&self, from: RECT, to: RECT, spec: MotionSpec) {
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
            spec,
        );
        self.commit();
    }

    fn morph_brand_centered(&self, from: RECT, to: RECT, spec: MotionSpec) {
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
            spec,
        );
        self.commit();
    }

    fn morph_clip(&self, from: RECT, to: RECT, radius_from: f32, radius_to: f32, spec: MotionSpec) {
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
            std::array::from_fn(|i| eased_anim(device, edges[i].0, edges[i].1, spec));
        let radius = eased_anim(device, radius_from, radius_to, spec);
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

    fn morph_opacity(&self, from: f32, to: f32, spec: MotionSpec) {
        let Some(device) = self.device.as_ref() else {
            return;
        };
        let Some(effect) = self.effect.as_ref() else {
            return;
        };
        let o0 = from.clamp(0.0, 1.0);
        let o1 = to.clamp(0.0, 1.0);
        if let Some(anim) = eased_anim(device, o0, o1, spec) {
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

pub fn attach(
    hwnd: HWND,
    w: i32,
    h: i32,
    surface: &BootSurface,
    kind: OverlayKind,
) -> Option<Overlay> {
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

fn apply_pose_anim(
    device: &IDCompositionDevice,
    visual: &IDCompositionVisual,
    scale: &IDCompositionScaleTransform,
    from: (f32, f32, f32, f32),
    to: (f32, f32, f32, f32),
    spec: MotionSpec,
) {
    let (ox0, oy0, sx0, sy0) = from;
    let (ox1, oy1, sx1, sy1) = to;
    let ax = eased_anim(device, ox0, ox1, spec);
    let ay = eased_anim(device, oy0, oy1, spec);
    let asx = eased_anim(device, sx0, sx1, spec);
    let asy = eased_anim(device, sy0, sy1, spec);
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
