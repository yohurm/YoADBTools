/**
 * 启动编排：原生小窗（壳）→ 主窗 hydrate（隐藏）→ 揭大窗并关掉小窗。
 * 禁止用第二 WebView 当启动页。禁止再用 HTML 品牌页充当用户可见启动窗。
 */

import { windowShow, YoLog } from "@yohu/api";

/** 对齐 MotionDuration.local / effectsExit。主窗已可见时的淡出。 */
export const BOOT_OVERLAY_EXIT_MS = 200;

let revealOnce: Promise<void> | null = null;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** 等浏览器把当前帧合成出去（双 rAF）。 */
export async function waitForNextPaint(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

/** 揭主窗。多次调用共用同一次揭幕。 */
export function revealMainWindow(): Promise<void> {
  revealOnce ??= (async () => {
    await waitForNextPaint();
    try {
      await windowShow();
    } catch (e) {
      YoLog.warn("shell", `揭窗失败，等待壳超时兜底 ${String(e)}`);
    }
  })();
  return revealOnce;
}

export async function dismissBootOverlay(opts?: { instant?: boolean }): Promise<void> {
  const el = document.getElementById("yohu-boot");
  if (!el) {
    return;
  }
  el.setAttribute("aria-busy", "false");
  el.setAttribute("aria-hidden", "true");
  const instant = opts?.instant || prefersReducedMotion();
  const exitMs = instant ? 0 : BOOT_OVERLAY_EXIT_MS;
  if (exitMs > 0) {
    el.classList.add("yohu-boot--leave");
    await sleep(exitMs);
  }
  el.remove();
}

export async function runBootPipeline(opts: {
  load: () => Promise<void>;
  refresh: () => void;
}): Promise<void> {
  const loading = opts.load().catch((e: unknown) => {
    YoLog.error("shell", `启动加载失败 ${String(e)}`);
  });
  await loading;
  await waitForNextPaint();
  await dismissBootOverlay({ instant: true });
  YoLog.info("shell", "工作台已就绪，揭主窗口");
  await revealMainWindow();
  opts.refresh();
}

/** 单测重置揭幕闩。 */
export function resetMainWindowRevealForTests(): void {
  revealOnce = null;
}
