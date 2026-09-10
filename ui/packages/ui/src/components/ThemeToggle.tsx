/**
 * YoThemeToggle —— 标题栏深浅色图标钮。
 * 图标：鸿蒙控制中心太阳/月亮叠层交叉（shadcn ModeToggle 的 rotate+scale）。
 * 整页：`runThemeViewTransition` 圆形揭示。偏好持久化由壳 `onThemeChange` 负责。
 */
import { createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Icon } from "../icons";
import {
  nextResolvedTheme,
  runThemeViewTransition,
  themeTransitionOriginFromElement,
} from "../motion/theme-transition";
import { getTheme, onResolvedThemeChange, setTheme, type ThemeName } from "../tokens";
import { Layout } from "../tokens/layout";
import "./IconButton.css";
import "./ThemeToggle.css";

export interface YoThemeToggleProps {
  /** 主题已应用到 document 后回调（壳用来 settings.set） */
  onThemeChange?: (theme: ThemeName) => void | Promise<void>;
}

function toggleTitle(theme: ThemeName): string {
  return theme === "dark" ? "切换到浅色模式" : "切换到深色模式";
}

/**
 * 渲染标题栏深浅色切换钮（当前浅色显示太阳，深色显示月亮）。
 */
export function YoThemeToggle(props: YoThemeToggleProps): JSX.Element {
  const [resolved, setResolved] = createSignal<ThemeName>(getTheme());
  const [busy, setBusy] = createSignal(false);

  onMount(() => {
    setResolved(getTheme());
    onCleanup(onResolvedThemeChange(setResolved));
  });

  const title = () => toggleTitle(resolved());

  return (
    <button
      type="button"
      class="yohu-icon-button yohu-theme-toggle yohu-focus-ring"
      title={title()}
      aria-label={title()}
      aria-pressed={resolved() === "dark"}
      disabled={busy()}
      onClick={(event) => {
        const next = nextResolvedTheme();
        const origin = themeTransitionOriginFromElement(event.currentTarget);
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
          <Icon name="display-on" size={Layout.IconSm} />
        </span>
        <span class="yohu-theme-toggle__moon">
          <Icon name="display-off" size={Layout.IconSm} />
        </span>
      </span>
    </button>
  );
}
