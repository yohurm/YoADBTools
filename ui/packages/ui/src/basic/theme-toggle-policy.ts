/**
 * 主题切换钮交互策略（L3）。
 * busy 关掉输入；宿主属性交给 YoIconButton，不复制按钮铬。
 */

import type { ThemeName } from "../tokens";
import { themeToggleDark, themeToggleTitle } from "./theme-toggle-model";

export interface ThemeToggleInteractiveInput {
  busy?: boolean;
}

export interface ThemeToggleInteractive {
  disabled: boolean;
  busy: boolean;
}

export function resolveThemeToggleInteractive(input: ThemeToggleInteractiveInput): ThemeToggleInteractive {
  const busy = Boolean(input.busy);
  return { disabled: busy, busy };
}

export interface ThemeToggleHostAttrs {
  title: string;
  disabled: boolean;
  "aria-pressed": boolean;
}

export function themeToggleHostAttrs(theme: ThemeName, busy?: boolean): ThemeToggleHostAttrs {
  const interactive = resolveThemeToggleInteractive({ busy });
  return {
    title: themeToggleTitle(theme),
    disabled: interactive.disabled,
    "aria-pressed": themeToggleDark(theme),
  };
}
