//! 舞台色板：只消费 `tokens`，禁止再写一份 ARGB。

use crate::tokens::{
    FONT_BODY, FONT_SUBTITLE, ICON_LG, RADIUS_MD, STAGE_DARK_BORDER, STAGE_DARK_FG, STAGE_DARK_FG2,
    STAGE_DARK_SURFACE, STAGE_DARK_SURFACE_2, STAGE_LIGHT_BORDER, STAGE_LIGHT_FG, STAGE_LIGHT_FG2,
    STAGE_LIGHT_SURFACE, STAGE_LIGHT_SURFACE_2,
};

pub struct StagePalette {
    pub canvas_argb: u32,
    pub title_argb: u32,
    pub body_argb: u32,
    pub icon_argb: u32,
    pub well_argb: u32,
    pub border_argb: u32,
}

pub fn stage_palette(dark: bool) -> StagePalette {
    if dark {
        StagePalette {
            canvas_argb: STAGE_DARK_SURFACE,
            title_argb: STAGE_DARK_FG,
            body_argb: STAGE_DARK_FG2,
            icon_argb: STAGE_DARK_FG,
            well_argb: STAGE_DARK_SURFACE_2,
            border_argb: STAGE_DARK_BORDER,
        }
    } else {
        StagePalette {
            canvas_argb: STAGE_LIGHT_SURFACE,
            title_argb: STAGE_LIGHT_FG,
            body_argb: STAGE_LIGHT_FG2,
            icon_argb: STAGE_LIGHT_FG,
            well_argb: STAGE_LIGHT_SURFACE_2,
            border_argb: STAGE_LIGHT_BORDER,
        }
    }
}

pub fn stage_border_argb(dark: bool) -> u32 {
    stage_palette(dark).border_argb
}

pub fn stage_stroke_px(dpr: f32) -> f32 {
    let d = if dpr > 0.0 { dpr } else { 1.0 };
    d.max(1.0)
}

pub fn argb_to_rgba(c: u32) -> [f32; 4] {
    [
        ((c >> 16) & 0xFF) as f32 / 255.0,
        ((c >> 8) & 0xFF) as f32 / 255.0,
        (c & 0xFF) as f32 / 255.0,
        ((c >> 24) & 0xFF) as f32 / 255.0,
    ]
}

pub fn stage_type_px(dpr: f32) -> (u32, u32, u32) {
    let d = if dpr > 0.0 { dpr } else { 1.0 };
    let px = |n: f32| (n * d).round().max(1.0) as u32;
    (
        px(ICON_LG as f32),
        px(FONT_SUBTITLE as f32),
        px(FONT_BODY as f32),
    )
}

pub fn host_corner_radius(fullscreen: bool, dpr: f32) -> u32 {
    if fullscreen {
        0
    } else {
        let d = if dpr > 0.0 { dpr } else { 1.0 };
        (RADIUS_MD as f32 * d).round().max(0.0) as u32
    }
}
