/**
 * 滚动条领域模型（L2）。
 * 对照 OpenHarmony Scroll / ScrollBar：无法滚动则不显示；滑块高 = 视口² / 内容；
 * 默认条宽 4vp（Layout / Spacing.Xs）。不碰 DOM，不点 Dialog。
 * 溢出只认 in-flow 盒，不认 abspos 撑的 scrollHeight。
 * traveling 由祖先 YoTravel 信号提供；插值中不新出条；收回留 out 直到淡出结束。
 */

import { Layout } from "../tokens/layout";
import { Spacing } from "../tokens/spacing";

export type ScrollerPhase = "none" | "in" | "on" | "out";

/** 滑块最小高：与预览/标题栏热区同值（Layout.IconPreview）。 */
export const SCROLLER_THUMB_MIN = Layout.IconPreview;

export interface ScrollerThumb {
  top: number;
  height: number;
}

export interface ScrollerFlowBox {
  top: number;
  height: number;
}

/** CSS Positioned Layout：absolute / fixed 出流，不进溢出。 */
export function resolveScrollerFlowChild(position: string): boolean {
  return position !== "absolute" && position !== "fixed";
}

/** 直接子级 in-flow 底边。top 相对滚口（滚口须是 offsetParent）。abspos 不进盒。 */
export function resolveScrollerFlowSize(boxes: readonly ScrollerFlowBox[]): number {
  let extent = 0;
  for (const box of boxes) {
    if (!(box.height > 0)) continue;
    extent = Math.max(extent, box.top + box.height);
  }
  return extent;
}

/** 小于条宽的误差不当溢出（锁盒 1–2px / 亚像素）。对照 ArkUI：无法滚动则不显示。 */
export const SCROLLER_OVERFLOW_SLACK = Spacing.Xs;

/** 内容比视口多出一条宽以上才算可滚。 */
export function resolveScrollerOverflow(view: number, all: number): boolean {
  return view > 0 && all > view + SCROLLER_OVERFLOW_SLACK;
}

export function resolveScrollerPhase(input: {
  overflowing: boolean;
  traveling?: boolean;
  prev?: ScrollerPhase;
}): ScrollerPhase {
  if (input.overflowing) {
    if (input.prev === "in" || input.prev === "on") return "on";
    if (input.traveling) return input.prev === "out" ? "out" : "none";
    return "in";
  }
  if (input.prev === "in" || input.prev === "on" || input.prev === "out") return "out";
  return "none";
}

export function resolveScrollerThumb(input: {
  view: number;
  all: number;
  top: number;
  min?: number;
}): ScrollerThumb | undefined {
  const view = input.view;
  const all = input.all;
  const min = input.min ?? SCROLLER_THUMB_MIN;
  if (!resolveScrollerOverflow(view, all)) return undefined;
  const height = Math.min(view, Math.max(min, (view / all) * view));
  const room = Math.max(0, view - height);
  const range = all - view;
  const top = range > 0 ? (Math.max(0, input.top) / range) * room : 0;
  return { top, height };
}

/** 滑块位移 → 视口 scrollTop。room=0 不滚。 */
export function resolveScrollerScrollTop(input: {
  view: number;
  all: number;
  thumbHeight: number;
  thumbTop: number;
}): number {
  const range = input.all - input.view;
  const room = Math.max(0, input.view - input.thumbHeight);
  if (!(range > 0) || !(room > 0)) return 0;
  const ratio = Math.min(1, Math.max(0, input.thumbTop / room));
  return ratio * range;
}

/** 指针相对轨道 → 滑块 top，夹在 [0, room]。 */
export function resolveScrollerThumbTop(input: {
  pointerY: number;
  trackTop: number;
  grab: number;
  room: number;
}): number {
  return Math.min(input.room, Math.max(0, input.pointerY - input.trackTop - input.grab));
}
