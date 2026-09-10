/**
 * 整页主题切换：View Transitions + 从按钮圆心扩散/收回的 clip-path。
 * 对照 Telegram / Ant Design ThemeSwitch、beUI circle（Material standard）、
 * Léon Zhang 双层 clip（对侧层钉在满圆，避免收缩时闪底）。
 * 时长走 `spatialEnter`（350ms）；曲线用持续标准（对称扩散，不用出场加速）。
 * 无 API 或减少动态效果时直切。
 */
import { MotionEasing, motionSpecMs } from "../tokens/motion";
import { getTheme, type ThemeName } from "../tokens";
import { shouldSkipMotion } from "./reduced";

export interface ThemeTransitionOrigin {
  x: number;
  y: number;
}

/** 略大于最远角，让缓动尾段落在「已经盖满」之后（Magic UI / beUI 150% 同源）。 */
export const THEME_WIPE_COVERAGE = 1.05;

type ViewTransitionLike = {
  ready: Promise<void>;
  finished: Promise<void>;
  waitUntil?: (promise: Promise<unknown>) => void;
};

function startViewTransition(update: () => void): ViewTransitionLike | undefined {
  const start = document.startViewTransition?.bind(document);
  if (typeof start !== "function") {
    return undefined;
  }
  return start(update);
}

function waitFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number): void => {
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });
}

/** 以元素中心为揭示原点（键盘激活时比 click 坐标稳）。 */
export function themeTransitionOriginFromElement(el: Element): ThemeTransitionOrigin {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** 覆盖视口所需的圆半径（最远角斜边 × 覆盖余量）。 */
export function themeWipeRadius(x: number, y: number, width: number, height: number): number {
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) * THEME_WIPE_COVERAGE;
}

export function nextResolvedTheme(current: ThemeName = getTheme()): ThemeName {
  return current === "dark" ? "light" : "dark";
}

export function themeWipeFrames(
  origin: ThemeTransitionOrigin,
  radius: number,
  fromDark: boolean,
): { moving: string[]; hold: string[]; movingPseudo: string; holdPseudo: string } {
  const collapsed = `circle(0px at ${origin.x}px ${origin.y}px)`;
  const expanded = `circle(${radius}px at ${origin.x}px ${origin.y}px)`;
  if (fromDark) {
    return {
      moving: [expanded, collapsed],
      hold: [expanded, expanded],
      movingPseudo: "::view-transition-old(root)",
      holdPseudo: "::view-transition-new(root)",
    };
  }
  return {
    moving: [collapsed, expanded],
    hold: [expanded, expanded],
    movingPseudo: "::view-transition-new(root)",
    holdPseudo: "::view-transition-old(root)",
  };
}

function playWipe(root: HTMLElement, origin: ThemeTransitionOrigin, fromDark: boolean): Animation {
  const radius = themeWipeRadius(origin.x, origin.y, window.innerWidth, window.innerHeight);
  const frames = themeWipeFrames(origin, radius, fromDark);
  const common = {
    duration: motionSpecMs("spatialEnter"),
    easing: MotionEasing.standard,
    fill: "forwards" as const,
  };
  const moving = root.animate({ clipPath: frames.moving }, { ...common, pseudoElement: frames.movingPseudo });
  root.animate({ clipPath: frames.hold }, { ...common, pseudoElement: frames.holdPseudo });
  return moving;
}

/**
 * 在 `apply` 写入新主题的同时播放整页圆形揭示。
 * `apply` 必须同步改 DOM（本项目 `setTheme` 即是）。
 */
export async function runThemeViewTransition(
  apply: () => void,
  origin: ThemeTransitionOrigin,
): Promise<void> {
  const fromDark = getTheme() === "dark";
  if (shouldSkipMotion() || typeof document.startViewTransition !== "function") {
    apply();
    return;
  }

  const root = document.documentElement;
  root.setAttribute("data-theme-transition", fromDark ? "to-light" : "to-dark");
  try {
    const transition = startViewTransition(apply);
    if (!transition) {
      apply();
      return;
    }
    await transition.ready;
    await waitFrames(1);
    const wipe = playWipe(root, origin, fromDark);
    const wipeDone = wipe.finished.catch(() => undefined);
    transition.waitUntil?.(wipeDone);
    await wipeDone;
    await waitFrames(1);
    await transition.finished.catch(() => undefined);
  } finally {
    root.removeAttribute("data-theme-transition");
  }
}
