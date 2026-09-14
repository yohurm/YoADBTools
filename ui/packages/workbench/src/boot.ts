/**
 * 启动编排：原生小窗（壳）→ 主窗 hydrate（隐藏）→ 揭大窗并关掉小窗。
 * 禁止用第二 WebView 当启动页。禁止再用 HTML 品牌页充当用户可见启动窗。
 * 同屏/异屏交接动画在 `boot.showMain` 的原生侧完成；前端只保证 hydrate 后再 invoke。
 */

import { windowShow, YoLog } from "@yohu/api";

let revealOnce: Promise<void> | null = null;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** 等浏览器把当前帧合成出去（双 rAF）。 */
export async function waitForNextPaint(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

/** 揭主窗。多次调用共用同一次揭幕。失败上抛，不假装成功。 */
export function revealMainWindow(): Promise<void> {
  revealOnce ??= (async () => {
    await waitForNextPaint();
    await windowShow();
  })();
  return revealOnce;
}

export async function dismissBootOverlay(): Promise<void> {
  const el = document.getElementById("yohu-boot");
  if (!el) {
    return;
  }
  el.setAttribute("aria-busy", "false");
  el.setAttribute("aria-hidden", "true");
  el.remove();
}

export async function runBootPipeline(opts: {
  load: () => Promise<void>;
  refresh: () => void;
}): Promise<void> {
  await opts.load();
  await waitForNextPaint();
  await dismissBootOverlay();
  YoLog.info("shell", "工作台已就绪，揭主窗口");
  try {
    await revealMainWindow();
  } catch (e) {
    YoLog.error("shell", `揭窗失败 ${String(e)}`);
    throw e;
  }
  opts.refresh();
}

/** 单测重置揭幕闩。 */
export function resetMainWindowRevealForTests(): void {
  revealOnce = null;
}
