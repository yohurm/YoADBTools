//! Scale：按 Fit 的 dest 选核。不改 dest、不算 contain。
//!
//! macOS 没有 Windows 那条 3×3 HLSL。缩小用线性 minify，1:1 / 整数放大用 nearest。
//! 禁止在 attach 时焊死一种滤镜。

use objc2_quartz_core::{kCAFilterLinear, kCAFilterNearest, CALayer};

use crate::mirror_present::scale::{scale_kernel, Letterbox, ScaleKernel};

pub fn apply_default_kernel(layer: &CALayer) {
    apply_layer_kernel(
        layer,
        1,
        1,
        Letterbox {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            nearest: true,
            crop_w: 0,
            crop_h: 0,
        },
    );
}

pub fn apply_layer_kernel(layer: &CALayer, src_w: u32, src_h: u32, dest: Letterbox) {
    match scale_kernel(src_w, src_h, dest) {
        ScaleKernel::Nearest => {
            layer.setMinificationFilter(kCAFilterNearest);
            layer.setMagnificationFilter(kCAFilterNearest);
        }
        ScaleKernel::Area => {
            layer.setMinificationFilter(kCAFilterLinear);
            layer.setMagnificationFilter(kCAFilterNearest);
        }
    }
}
