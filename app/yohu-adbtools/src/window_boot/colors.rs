//! 主窗画布色：Tauri `Color` 封装。RGB / BGRA 在 `theme_spec`，禁止再写一份。

use tauri::window::Color;

use crate::theme_spec::canvas_rgb;

pub fn canvas_color(dark: bool) -> Color {
    let (r, g, b) = canvas_rgb(dark);
    Color(r, g, b, 255)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tauri_color_wraps_theme_spec() {
        let Color(r, g, b, a) = canvas_color(false);
        assert_eq!((r, g, b, a), (0xF1, 0xF3, 0xF5, 255));
        let Color(r, g, b, a) = canvas_color(true);
        assert_eq!((r, g, b, a), (0x19, 0x1A, 0x1C, 255));
    }
}
