//! 壳原生面与 `@yohu/ui` testdata 孪生的规格池。
//! 禁止在 splash / stage / chrome 再写第二份色值、字号、圆角、间距、出场 scale。

/// 与 `Colors.BgBase` / `DarkColors.BgBase` 同值。
pub const CANVAS_LIGHT_RGB: (u8, u8, u8) = (0xF1, 0xF3, 0xF5);
pub const CANVAS_DARK_RGB: (u8, u8, u8) = (0x19, 0x1A, 0x1C);
/// GDI 不画 alpha；RGB 对齐 `Colors.Fg` / `DarkColors.Fg`。
pub const BRAND_TEXT_LIGHT_RGB: (u8, u8, u8) = (0, 0, 0);
pub const BRAND_TEXT_DARK_RGB: (u8, u8, u8) = (0xE5, 0xE5, 0xE5);

/// 舞台 ARGB，对齐 `Colors` / `DarkColors` Surface / Fg / Fg2 / Fg3 / Surface2。
pub const STAGE_LIGHT_SURFACE: u32 = 0xFFFFFFFF;
pub const STAGE_LIGHT_SURFACE_2: u32 = 0xFFE5E5EA;
pub const STAGE_LIGHT_FG: u32 = 0xE5000000;
pub const STAGE_LIGHT_FG2: u32 = 0x99000000;
pub const STAGE_LIGHT_BORDER: u32 = 0x66000000;
pub const STAGE_DARK_SURFACE: u32 = 0xFF202224;
pub const STAGE_DARK_SURFACE_2: u32 = 0xFF2E3033;
pub const STAGE_DARK_FG: u32 = 0xE5FFFFFF;
pub const STAGE_DARK_FG2: u32 = 0x99FFFFFF;
pub const STAGE_DARK_BORDER: u32 = 0x66FFFFFF;

/// 与 `Radius.Md` / `Radius.Sm` 同值。
pub const RADIUS_MD: i32 = 16;
pub const RADIUS_SM: i32 = 8;

/// 与 `Spacing.Sm` / `Lg` / `Xl` 同值。
pub const SPACE_SM: i32 = 8;
pub const SPACE_LG: i32 = 16;
pub const SPACE_XL: i32 = 24;

/// 与 `FontSizes.PageTitle` / `Subtitle` / `Body`、`Layout.IconLg` 同值。
/// `ICON_SM` 是拖出预览边长（32）；YoUI `Layout.IconSm` 是 16，与 `SPACE_LG` 同值。
pub const FONT_PAGE_TITLE: i32 = 18;
pub const FONT_SUBTITLE: i32 = 16;
pub const FONT_BODY: i32 = 14;
/// macOS 拖出预览 / 加载环初值；Windows 铬走 `stage_type_px` 的 `ICON_LG`。
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub const ICON_SM: i32 = 32;
pub const ICON_LG: i32 = 40;

/// 与 `FontFamilies.Sans` 第一族同值（GDI / DWrite 族名）。
pub const FONT_SANS: &str = "Segoe UI";

/// 与 `Layout.WindowDefaultW/H`、`WindowMinW/H` 同值。
pub const WINDOW_DEFAULT_W: u32 = 1200;
pub const WINDOW_DEFAULT_H: u32 = 800;
pub const WINDOW_MIN_W: i32 = 1024;
pub const WINDOW_MIN_H: i32 = 768;

/// 鸿蒙 `WindowAnimationConfig` 窗口进出场默认 scale。
pub const WINDOW_EXIT_SCALE: f64 = 0.7;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canvas_twins_youi_bg_base() {
        assert_eq!(CANVAS_LIGHT_RGB, (0xF1, 0xF3, 0xF5));
        assert_eq!(CANVAS_DARK_RGB, (0x19, 0x1A, 0x1C));
        assert_eq!(BRAND_TEXT_LIGHT_RGB, (0, 0, 0));
        assert_eq!(BRAND_TEXT_DARK_RGB, (0xE5, 0xE5, 0xE5));
    }

    #[test]
    fn stage_palette_twins_youi_surface() {
        assert_eq!(STAGE_LIGHT_SURFACE, 0xFFFFFFFF);
        assert_eq!(STAGE_LIGHT_SURFACE_2, 0xFFE5E5EA);
        assert_eq!(STAGE_LIGHT_FG, 0xE5000000);
        assert_eq!(STAGE_LIGHT_FG2, 0x99000000);
        assert_eq!(STAGE_LIGHT_BORDER, 0x66000000);
        assert_eq!(STAGE_DARK_SURFACE, 0xFF202224);
        assert_eq!(STAGE_DARK_SURFACE_2, 0xFF2E3033);
        assert_eq!(STAGE_DARK_FG, 0xE5FFFFFF);
        assert_eq!(STAGE_DARK_FG2, 0x99FFFFFF);
        assert_eq!(STAGE_DARK_BORDER, 0x66FFFFFF);
    }

    #[test]
    fn radius_font_window_twin_youi() {
        assert_eq!(RADIUS_MD, 16);
        assert_eq!(RADIUS_SM, 8);
        assert_eq!(SPACE_SM, 8);
        assert_eq!(SPACE_LG, 16);
        assert_eq!(SPACE_XL, 24);
        assert_eq!(FONT_PAGE_TITLE, 18);
        assert_eq!(FONT_SUBTITLE, 16);
        assert_eq!(FONT_BODY, 14);
        assert_eq!(ICON_SM, 32);
        assert_eq!(ICON_LG, 40);
        assert_eq!(FONT_SANS, "Segoe UI");
        assert_eq!(WINDOW_DEFAULT_W, 1200);
        assert_eq!(WINDOW_DEFAULT_H, 800);
        assert_eq!(WINDOW_MIN_W, 1024);
        assert_eq!(WINDOW_MIN_H, 768);
        assert!((WINDOW_EXIT_SCALE - 0.7).abs() < f64::EPSILON);
    }
}
