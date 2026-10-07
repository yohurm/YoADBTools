/**
 * @yohu/ui token 入口。
 * 引入 theme.css + states.css；导出 setTheme/getTheme（含 system 偏好）。
 * 焦点框模态在本文件绑一次，壳不必再 bind/unbind。
 */
import "./theme.css";
import "./states.css";

import { densityIsCompact, densityScale, type DensityName } from "./density";
import { bindFocusModality } from "./focus-modality";
import { themeFromDark, themeIsDark, type ThemeName } from "./theme-name";

export { themeFromDark, themeIsDark, type ThemeName } from "./theme-name";

export * from "./colors";
export * from "./logcat";
export * from "./typography";
export * from "./spacing";
export * from "./radius";
export * from "./density";
export * from "./layout";
export * from "./elevation";
export * from "./z-index";
export * from "./motion";
export * from "./state";
export { bindFocusModality } from "./focus-modality";
export { emitThemeCss } from "./emit-theme";

if (typeof document !== "undefined") {
  bindFocusModality();
}

/** 用户偏好（写入 `data-theme-pref`；system 跟随系统）。 */
export type ThemePreference = ThemeName | "system";

/** 跟随系统。深色仍由 themeIsDark 判定。其余偏好读出来就是 light。 */
export function themePreferenceIsSystem(theme: string | null | undefined): theme is "system" {
  return theme === "system";
}

let systemMedia: MediaQueryList | null = null;
let systemListener: ((event: MediaQueryListEvent) => void) | null = null;
const resolvedThemeListeners = new Set<(theme: ThemeName) => void>();

function colorSchemeMedia(): MediaQueryList | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return undefined;
  }
  return window.matchMedia("(prefers-color-scheme: dark)");
}

function prefersDark(): boolean {
  return colorSchemeMedia()?.matches ?? false;
}

function applyResolved(theme: ThemeName): void {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  for (const listener of resolvedThemeListeners) {
    listener(theme);
  }
}

function detachSystemListener(): void {
  if (systemMedia && systemListener) {
    systemMedia.removeEventListener("change", systemListener);
  }
  systemMedia = null;
  systemListener = null;
}

function attachSystemListener(): void {
  detachSystemListener();
  const media = colorSchemeMedia();
  if (!media) {
    return;
  }
  systemMedia = media;
  systemListener = (event) => applyResolved(themeFromDark(event.matches));
  systemMedia.addEventListener("change", systemListener);
}

/**
 * 切换主题偏好。`system` 解析 `prefers-color-scheme` 并监听变更。
 */
export function setTheme(theme: ThemePreference): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.setAttribute("data-theme-pref", theme);
  if (themePreferenceIsSystem(theme)) {
    applyResolved(themeFromDark(prefersDark()));
    attachSystemListener();
    return;
  }
  detachSystemListener();
  applyResolved(theme);
}

/**
 * 解析后外观变更（`setTheme` 与 system 跟随）。返回取消订阅。
 */
export function onResolvedThemeChange(listener: (theme: ThemeName) => void): () => void {
  resolvedThemeListeners.add(listener);
  return () => {
    resolvedThemeListeners.delete(listener);
  };
}

/**
 * 读取已解析外观；未设置时视为 light。
 */
export function getTheme(): ThemeName {
  const attr = typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") : null;
  return themeFromDark(themeIsDark(attr));
}

/**
 * 读取用户偏好；未设置时视为 light（测试与未调用 setTheme 的兜底）。
 */
export function getThemePreference(): ThemePreference {
  const pref = typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme-pref") : null;
  if (themeIsDark(pref) || themePreferenceIsSystem(pref)) return pref;
  return "light";
}

/** 切换密度（compact/comfortable）。 */
export function setDensity(density: DensityName): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-density", density);
  }
}

/** 读取当前密度；未显式设置时视为 comfortable（鸿蒙 PC 默认）。 */
export function getDensity(): DensityName {
  const attr = typeof document !== "undefined" ? document.documentElement.getAttribute("data-density") : null;
  return densityIsCompact(attr) ? "compact" : "comfortable";
}

/** 清单控件行高（px）。虚拟列表要数字，不能只靠 CSS 变量。 */
export function controlRowHeight(): number {
  return densityScale(getDensity()).controlHeight;
}
