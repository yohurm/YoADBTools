//! 占用卡片是 HWND 上的 DComp clip，坐标相对主窗客户区。
//! HWND 铺满主窗；clip 只在 Fill→Dest / Dest→Fill 时插值。是否插值只认 [`OccupancyMotion`]。

use std::time::Instant;

use windows::core::Result as WinResult;
use windows::Win32::Foundation::{E_FAIL, HWND};
use windows::Win32::Graphics::DirectComposition::{
    DCompositionCreateDevice, IDCompositionAnimation, IDCompositionDevice,
    IDCompositionRectangleClip, IDCompositionTarget, IDCompositionVisual,
};
use windows::Win32::Graphics::Dxgi::{IDXGIDevice, IDXGISwapChain1};
use yohu_motion::{ease_at, eased_anim, MotionSpec};

use crate::mirror_present::stage::OccupancyMotion;

pub struct DcompTree {
    device: IDCompositionDevice,
    _target: IDCompositionTarget,
    _visual: IDCompositionVisual,
    clip: IDCompositionRectangleClip,
    clip_from: (f32, f32, f32, f32),
    clip_to: (f32, f32, f32, f32),
    clip_radius: f32,
    clip_anim_at: Option<Instant>,
    clip_spec: MotionSpec,
}

pub fn attach_dcomp(
    dxgi: &IDXGIDevice,
    hwnd: HWND,
    swapchain: &IDXGISwapChain1,
    width: u32,
    height: u32,
    radius: u32,
) -> WinResult<DcompTree> {
    let device: IDCompositionDevice = unsafe { DCompositionCreateDevice(dxgi)? };
    let target = unsafe { device.CreateTargetForHwnd(hwnd, true)? };
    let visual = unsafe { device.CreateVisual()? };
    let clip = unsafe { device.CreateRectangleClip()? };
    unsafe {
        visual.SetContent(swapchain)?;
        visual.SetClip(&clip)?;
        target.SetRoot(&visual)?;
    }
    let mut tree = DcompTree {
        device,
        _target: target,
        _visual: visual,
        clip,
        clip_from: (-1.0, -1.0, -1.0, -1.0),
        clip_to: (-1.0, -1.0, -1.0, -1.0),
        clip_radius: -1.0,
        clip_anim_at: None,
        clip_spec: MotionSpec::SpatialPanel,
    };
    apply_occupancy_clip(
        &mut tree,
        0.0,
        0.0,
        width.max(1) as f32,
        height.max(1) as f32,
        radius,
        OccupancyMotion::Follow,
    )?;
    Ok(tree)
}

fn clip_close(a: (f32, f32, f32, f32), b: (f32, f32, f32, f32)) -> bool {
    (a.0 - b.0).abs() < 0.5
        && (a.1 - b.1).abs() < 0.5
        && (a.2 - b.2).abs() < 0.5
        && (a.3 - b.3).abs() < 0.5
}

fn clip_progress(tree: &DcompTree) -> Option<f32> {
    let at = tree.clip_anim_at?;
    let u = (at.elapsed().as_secs_f32() / (tree.clip_spec.duration_ms() as f32 / 1000.0))
        .clamp(0.0, 1.0);
    Some(u)
}

pub fn clip_animating(tree: &DcompTree) -> bool {
    clip_progress(tree).is_some_and(|u| u < 1.0)
}

pub fn clip_now(tree: &DcompTree) -> (f32, f32, f32, f32) {
    let Some(at) = tree.clip_anim_at else {
        return tree.clip_to;
    };
    let e = ease_at(tree.clip_spec, at.elapsed());
    if e >= 1.0 {
        return tree.clip_to;
    }
    let (fl, ft, fr, fb) = tree.clip_from;
    let (tl, tt, tr, tb) = tree.clip_to;
    (
        fl + (tl - fl) * e,
        ft + (tt - ft) * e,
        fr + (tr - fr) * e,
        fb + (tb - fb) * e,
    )
}

fn animate_scalar(
    device: &IDCompositionDevice,
    from: f32,
    to: f32,
    spec: MotionSpec,
) -> WinResult<IDCompositionAnimation> {
    eased_anim(device, from, to, spec).ok_or_else(|| windows::core::Error::from(E_FAIL))
}

fn apply_clip_radius(clip: &IDCompositionRectangleClip, r: f32) -> WinResult<()> {
    unsafe {
        clip.SetTopLeftRadiusX2(r)?;
        clip.SetTopLeftRadiusY2(r)?;
        clip.SetTopRightRadiusX2(r)?;
        clip.SetTopRightRadiusY2(r)?;
        clip.SetBottomLeftRadiusX2(r)?;
        clip.SetBottomLeftRadiusY2(r)?;
        clip.SetBottomRightRadiusX2(r)?;
        clip.SetBottomRightRadiusY2(r)?;
    }
    Ok(())
}

pub fn apply_occupancy_clip(
    tree: &mut DcompTree,
    left: f32,
    top: f32,
    right: f32,
    bottom: f32,
    radius: u32,
    motion: OccupancyMotion,
) -> WinResult<bool> {
    let spec = motion.spec();
    let animate = spec.is_some() && yohu_motion::motion_allowed();
    let to = (left, top, right, bottom);
    let r = radius as f32;
    let radius_changed = (tree.clip_radius - r).abs() >= 0.5;
    if clip_close(to, tree.clip_to) {
        if clip_animating(tree) {
            if radius_changed {
                apply_clip_radius(&tree.clip, r)?;
                tree.clip_radius = r;
                unsafe {
                    tree.device.Commit()?;
                }
            }
            return Ok(false);
        }
        if !radius_changed {
            return Ok(false);
        }
        apply_clip_radius(&tree.clip, r)?;
        tree.clip_radius = r;
        unsafe {
            tree.device.Commit()?;
        }
        return Ok(false);
    }

    let from = clip_now(tree);
    apply_clip_radius(&tree.clip, r)?;
    tree.clip_radius = r;
    unsafe {
        if let (true, Some(spec)) = (animate && !clip_close(from, to), spec) {
            let left_a = animate_scalar(&tree.device, from.0, to.0, spec)?;
            let top_a = animate_scalar(&tree.device, from.1, to.1, spec)?;
            let right_a = animate_scalar(&tree.device, from.2, to.2, spec)?;
            let bottom_a = animate_scalar(&tree.device, from.3, to.3, spec)?;
            tree.clip.SetLeft(&left_a)?;
            tree.clip.SetTop(&top_a)?;
            tree.clip.SetRight(&right_a)?;
            tree.clip.SetBottom(&bottom_a)?;
            tree.clip_from = from;
            tree.clip_to = to;
            tree.clip_anim_at = Some(Instant::now());
            tree.clip_spec = spec;
            tracing::info!(
                left = to.0,
                top = to.1,
                right = to.2,
                bottom = to.3,
                ?spec,
                "占用盒 DComp clip"
            );
        } else {
            tree.clip.SetLeft2(left)?;
            tree.clip.SetTop2(top)?;
            tree.clip.SetRight2(right)?;
            tree.clip.SetBottom2(bottom)?;
            tree.clip_from = to;
            tree.clip_to = to;
            tree.clip_anim_at = None;
        }
        tree.device.Commit()?;
    }
    Ok(true)
}
