/**
 * 整页主题切换：View Transitions + 从按钮圆心扩散/收回的 clip-path。
 * 对照 Telegram / Ant Design ThemeSwitch、beUI circle（Material standard）、
 * Léon Zhang 双层 clip（对侧层钉在满圆，避免收缩时闪底）。
 * 时长走 `spatialEnter`（350ms）；曲线用持续标准（对称扩散，不用出场加速）。
 * 无 API 或减少动态效果时直切。
 */
import { MotionEasing, motionSpecMs } from "../../../tokens/motion";
import { getTheme, themeIsDark, type ThemeName } from "../../../tokens";
import { shouldSkipMotion } from "../../reduced";

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
  skipTransition?: () => void;
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

function themeAxisCenter(origin: number, size: number): number {
  return origin + size / 2;
}

/** 以元素中心为揭示原点（键盘激活时比 click 坐标稳）。 */
export function themeTransitionOriginFromElement(el: Element): ThemeTransitionOrigin {
  const box = el.getBoundingClientRect();
  return { x: themeAxisCenter(box.left, box.width), y: themeAxisCenter(box.top, box.height) };
}

function themeFarEdge(point: number, span: number): number {
  return Math.max(point, span - point);
}

/** 覆盖视口所需的圆半径（最远角斜边 × 覆盖余量）。 */
export function themeWipeRadius(x: number, y: number, width: number, height: number): number {
  return Math.hypot(themeFarEdge(x, width), themeFarEdge(y, height)) * THEME_WIPE_COVERAGE;
}

export function nextResolvedTheme(current: ThemeName = getTheme()): ThemeName {
  return themeIsDark(current) ? "light" : "dark";
}

function themeWipeAt(x: number, y: number): string {
  return `${x}px ${y}px`;
}

function themeWipeHold(frame: string): [string, string] {
  return [frame, frame];
}

function themeViewLayer(which: "old" | "new"): string {
  return which === "old" ? "::view-transition-old(root)" : "::view-transition-new(root)";
}

function themeCircle(radius: number, at: string): string {
  return `circle(${radius}px at ${at})`;
}

export function themeWipeFrames(
  origin: ThemeTransitionOrigin,
  radius: number,
  fromDark: boolean,
): { moving: string[]; hold: string[]; movingPseudo: string; holdPseudo: string } {
  const collapsed = themeCircle(0, themeWipeAt(origin.x, origin.y));
  const expanded = themeCircle(radius, themeWipeAt(origin.x, origin.y));
  if (fromDark) {
    return {
      moving: [expanded, collapsed],
      hold: themeWipeHold(expanded),
      movingPseudo: themeViewLayer("old"),
      holdPseudo: themeViewLayer("new"),
    };
  }
  return {
    moving: [collapsed, expanded],
    hold: themeWipeHold(expanded),
    movingPseudo: themeViewLayer("new"),
    holdPseudo: themeViewLayer("old"),
  };
}

function themeWipeClip(
  root: HTMLElement,
  frames: string[],
  pseudo: string,
  timing: { duration: number; easing: string; fill: "forwards" },
): Animation {
  return root.animate({ clipPath: frames }, { ...timing, pseudoElement: pseudo });
}

function playWipe(root: HTMLElement, origin: ThemeTransitionOrigin, fromDark: boolean): Animation[] {
  const radius = themeWipeRadius(origin.x, origin.y, window.innerWidth, window.innerHeight);
  const frames = themeWipeFrames(origin, radius, fromDark);
  const common = {
    duration: motionSpecMs("spatialEnter"),
    easing: MotionEasing.standard,
    fill: "forwards" as const,
  };
  return [
    themeWipeClip(root, frames.moving, frames.movingPseudo, common),
    themeWipeClip(root, frames.hold, frames.holdPseudo, common),
  ];
}

/** fill 只许在揭示进行时钉住末帧。伪元素卸掉之前必须松开，否则快照层留在文档上。 */
function releaseThemeWipe(anims: readonly Animation[]): void {
  for (const anim of anims) anim.cancel();
}

/** 新主题已经写进文档。结束 View Transition，卸掉 ::view-transition 叠层。 */
function endThemeTransition(transition: ViewTransitionLike): void {
  const skip = transition.skipTransition;
  if (typeof skip !== "function") return;
  try {
    skip.call(transition);
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
  }
}

function themeSettled(done: Promise<unknown>): Promise<void> {
  return done.catch(() => undefined);
}

/**
 * 在 `apply` 写入新主题的同时播放整页圆形揭示。
 * `apply` 必须同步改 DOM（本项目 `setTheme` 即是）。
 */
export async function runThemeViewTransition(
  apply: () => void,
  origin: ThemeTransitionOrigin,
): Promise<void> {
  const fromDark = themeIsDark(getTheme());
  if (shouldSkipMotion() || typeof document.startViewTransition !== "function") {
    apply();
    return;
  }

  const root = document.documentElement;
  root.setAttribute("data-theme-transition", fromDark ? "to-light" : "to-dark");
  let wipe: Animation[] = [];
  try {
    const transition = startViewTransition(apply);
    if (!transition) {
      apply();
      return;
    }
    await transition.ready;
    await waitFrames(1);
    wipe = playWipe(root, origin, fromDark);
    const moving = wipe[0];
    if (moving) {
      const wipeDone = themeSettled(moving.finished);
      transition.waitUntil?.(wipeDone);
      await wipeDone;
      releaseThemeWipe(wipe);
      wipe = [];
    }
    endThemeTransition(transition);
    await themeSettled(transition.finished);
  } finally {
    releaseThemeWipe(wipe);
    root.removeAttribute("data-theme-transition");
  }
}
