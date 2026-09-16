/**
 * YoThemeToggle —— 标题栏深浅色图标钮（L4 视图）。
 * 只组合 YoIconButton + 主题能力；不复制按钮铬。
 * 整页圆形揭示走 `runThemeViewTransition`；偏好持久化由壳 `onThemeChange` 负责。
 */
import { createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Icon } from "../icons";
import {
  nextResolvedTheme,
  runThemeViewTransition,
  themeTransitionOriginFromElement,
} from "../motion/theme-transition";
import { getTheme, onResolvedThemeChange, setTheme, type ThemeName } from "../tokens";
import { YoIconButton } from "./IconButton";
import { THEME_TOGGLE_MOON, THEME_TOGGLE_SUN } from "./theme-toggle-model";
import { themeToggleHostAttrs } from "./theme-toggle-policy";
import "./ThemeToggle.css";

export interface YoThemeToggleProps {
  /** 主题已应用到 document 后回调（壳用来 settings.set） */
  onThemeChange?: (theme: ThemeName) => void | Promise<void>;
}

/** 渲染标题栏深浅色切换钮（当前浅色显示太阳，深色显示月亮）。 */
export function YoThemeToggle(props: YoThemeToggleProps): JSX.Element {
  const [resolved, setResolved] = createSignal<ThemeName>(getTheme());
  const [busy, setBusy] = createSignal(false);

  onMount(() => {
    setResolved(getTheme());
    onCleanup(onResolvedThemeChange(setResolved));
  });

  const host = createMemo(() => themeToggleHostAttrs(resolved(), busy()));

  return (
    <YoIconButton
      title={host().title}
      aria-pressed={host()["aria-pressed"]}
      disabled={host().disabled}
      onClick={(event) => {
        const next = nextResolvedTheme();
        const target = event.currentTarget;
        if (!(target instanceof Element)) return;
        const origin = themeTransitionOriginFromElement(target);
        setBusy(true);
        void (async () => {
          try {
            await runThemeViewTransition(() => setTheme(next), origin);
            await props.onThemeChange?.(next);
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      <span class="yohu-theme-toggle__glyphs" aria-hidden="true">
        <span class="yohu-theme-toggle__sun">
          <Icon name={THEME_TOGGLE_SUN} />
        </span>
        <span class="yohu-theme-toggle__moon">
          <Icon name={THEME_TOGGLE_MOON} />
        </span>
      </span>
    </YoIconButton>
  );
}
