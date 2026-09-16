/**
 * 滚动条策略（L3）。
 * 宿主 data-scroll 只写 in|on|out；侧轨 data-lane 只写 on|off。
 * 拖拽几何在 L2；本文件不读盒。
 */

import type { ScrollerPhase } from "./scroller-model";

export function scrollerHostAttrs(
  phase: ScrollerPhase,
): { "data-scroll"?: Exclude<ScrollerPhase, "none"> } {
  return phase === "none" ? {} : { "data-scroll": phase };
}

export function scrollerLaneAttrs(phase: ScrollerPhase): { "data-lane": "on" | "off" } {
  return { "data-lane": phase === "none" ? "off" : "on" };
}
