/**
 * 主题切换钮领域模型（L2）。
 * 标题与按下语义由当前解析主题决定；不碰 DOM、不跑揭示动画。
 */

import type { ThemeName } from "../tokens";

export const THEME_TOGGLE_SUN = "display-on" as const;
export const THEME_TOGGLE_MOON = "display-off" as const;

export function themeToggleTitle(theme: ThemeName): string {
  return theme === "dark" ? "切换到浅色模式" : "切换到深色模式";
}

export function themeToggleDark(theme: ThemeName): boolean {
  return theme === "dark";
}
