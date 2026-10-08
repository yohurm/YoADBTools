/**
 * 滚动条策略（L3）。
 * 宿主 data-scroll 只写 in|on|out；data-bar 写 BarState；侧轨 data-lane 只写 on|off。
 * data-gutter 只写 on：溢出让出侧轨，与显隐相位分开。拖拽几何在 L2；本文件不读盒。
 */

import { presenceAttr } from "../dom/flag";
import { listEdgeKey, type ListEdge } from "../keymap/list-index";
import {
  scrollerAxisIsBoth,
  scrollerPhaseIsNone,
  type ScrollerAxis,
  type ScrollerBarState,
  type ScrollerPhase,
} from "./scroller-model";

export function scrollerHostAttrs(
  phase: ScrollerPhase,
  barState: ScrollerBarState,
  interactive: boolean,
  axis: ScrollerAxis,
  gutter = false,
  gutterInline = false,
  phaseInline: ScrollerPhase = "none",
): {
  "data-scroll"?: Exclude<ScrollerPhase, "none">;
  "data-scroll-inline"?: Exclude<ScrollerPhase, "none">;
  "data-bar": ScrollerBarState;
  "data-interactive"?: "off";
  "data-gutter"?: "on";
  "data-gutter-inline"?: "on";
  "data-axis"?: "both";
} {
  return {
    ...(scrollerPhaseIsNone(phase) ? {} : { "data-scroll": phase }),
    ...(scrollerPhaseIsNone(phaseInline) ? {} : { "data-scroll-inline": phaseInline }),
    "data-bar": barState,
    ...(interactive ? {} : { "data-interactive": "off" as const }),
    ...(gutter ? { "data-gutter": "on" as const } : {}),
    ...(gutterInline ? { "data-gutter-inline": "on" as const } : {}),
    ...(scrollerAxisIsBoth(axis) ? { "data-axis": "both" as const } : {}),
  };
}

export function scrollerLaneAttrs(phase: ScrollerPhase): { "data-lane": "on" | "off" } {
  return { "data-lane": scrollerPhaseIsNone(phase) ? "off" : "on" };
}

export function scrollerThumbAttrs(pressed: boolean): { "data-pressed": "" | undefined } {
  return { "data-pressed": presenceAttr(pressed) };
}

const STEAL_KEYS =
  "input,textarea,select,[contenteditable=true],[role=listbox],[role=option],[role=tree],[role=treeitem]";

/** 焦点在字段 / 列表 / 树内时，滚轴不抢翻页键。 */
export function scrollerStealsKeys(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(STEAL_KEYS));
}

export type ScrollerKeyAction = "pageNext" | "pagePrev" | ListEdge;

/** 视口 Page/Home/End。字段焦点由 scrollerStealsKeys 先挡。 */
export function scrollerKeyAction(key: string): ScrollerKeyAction | undefined {
  if (key === "PageDown") return "pageNext";
  if (key === "PageUp") return "pagePrev";
  return listEdgeKey(key) ?? undefined;
}
