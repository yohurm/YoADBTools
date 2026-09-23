//! 主题判定与 RGB → 画布 / 品牌色。splash 与 window_boot 只消费，禁止互引。
//! 不持 Tauri `Color`；裸规格在 [`crate::tokens`]。

use yohu_protocol::Theme;

use crate::tokens::{BRAND_TEXT_DARK_RGB, BRAND_TEXT_LIGHT_RGB, CANVAS_DARK_RGB, CANVAS_LIGHT_RGB};

pub fn resolve_dark(pref: Theme, system_dark: bool) -> bool {
    match pref {
        Theme::Dark => true,
        Theme::Light => false,
        Theme::System => system_dark,
    }
}

pub fn canvas_rgb(dark: bool) -> (u8, u8, u8) {
    if dark {
        CANVAS_DARK_RGB
    } else {
        CANVAS_LIGHT_RGB
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
pub fn brand_text_rgb(dark: bool) -> (u8, u8, u8) {
    if dark {
        BRAND_TEXT_DARK_RGB
    } else {
        BRAND_TEXT_LIGHT_RGB
    }
}

/// DXGI / GDI DIB 用 B8G8R8A8。
#[cfg_attr(not(windows), allow(dead_code))]
pub fn canvas_bgra(dark: bool) -> [u8; 4] {
    let (r, g, b) = canvas_rgb(dark);
    [b, g, r, 255]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_dark_follows_preference() {
        assert!(resolve_dark(Theme::Dark, false));
        assert!(!resolve_dark(Theme::Light, true));
        assert!(resolve_dark(Theme::System, true));
        assert!(!resolve_dark(Theme::System, false));
    }

    #[test]
    fn canvas_and_brand_follow_tokens() {
        assert_eq!(canvas_rgb(false), (0xF1, 0xF3, 0xF5));
        assert_eq!(canvas_rgb(true), (0x19, 0x1A, 0x1C));
        assert_eq!(canvas_bgra(false), [0xF5, 0xF3, 0xF1, 255]);
        assert_eq!(canvas_bgra(true), [0x1C, 0x1A, 0x19, 255]);
        assert_eq!(brand_text_rgb(false), (0, 0, 0));
        assert_eq!(brand_text_rgb(true), (0xE5, 0xE5, 0xE5));
    }
}
