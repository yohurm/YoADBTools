/**
 * 滚动条策略（L3）。
 * 宿主 data-scroll 只写 in|on|out；data-bar 写 BarState；侧轨 data-lane 只写 on|off。
 * 拖拽几何在 L2；本文件不读盒。
 */

import type { ScrollerBarState, ScrollerPhase } from "./scroller-model";

export function scrollerHostAttrs(
  phase: ScrollerPhase,
  barState: ScrollerBarState = "auto",
  interactive = true,
): {
  "data-scroll"?: Exclude<ScrollerPhase, "none">;
  "data-bar": ScrollerBarState;
  "data-interactive"?: "off";
} {
  return {
    ...(phase === "none" ? {} : { "data-scroll": phase }),
    "data-bar": barState,
    ...(interactive ? {} : { "data-interactive": "off" as const }),
  };
}

export function scrollerLaneAttrs(phase: ScrollerPhase): { "data-lane": "on" | "off" } {
  return { "data-lane": phase === "none" ? "off" : "on" };
}

export function scrollerThumbAttrs(pressed: boolean): { "data-pressed"?: "" } {
  return pressed ? { "data-pressed": "" } : {};
}

const STEAL_KEYS =
  "input,textarea,select,[contenteditable=true],[role=listbox],[role=option],[role=tree],[role=treeitem]";

/** 焦点在字段 / 列表 / 树内时，滚轴不抢翻页键。 */
export function scrollerStealsKeys(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(STEAL_KEYS));
}

export type ScrollerKeyAction = "pageNext" | "pagePrev" | "start" | "end";

/** 视口 Page/Home/End。字段焦点由 scrollerStealsKeys 先挡。 */
export function scrollerKeyAction(key: string): ScrollerKeyAction | undefined {
  if (key === "PageDown") return "pageNext";
  if (key === "PageUp") return "pagePrev";
  if (key === "Home") return "start";
  if (key === "End") return "end";
  return undefined;
}
