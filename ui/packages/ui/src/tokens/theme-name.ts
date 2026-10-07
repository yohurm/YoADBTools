/** 解析后的外观（写入 `data-theme`）。色板和切换都认这一份。偏好里的 system 不是它。 */
export type ThemeName = "light" | "dark";

/** 已解析外观是深色。属性值、切换钮、揭示和投屏信箱都认这一把。 */
export function themeIsDark(theme: string | null | undefined): theme is "dark" {
  return theme === "dark";
}

/** 深色布尔写成解析后外观。系统跟随和属性回读都认这一把。 */
export function themeFromDark(dark: boolean): ThemeName {
  return dark ? "dark" : "light";
}
