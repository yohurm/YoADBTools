/**
 * 列表换位拖拽条（L4）。只在拖动会话 data-open；展开/收回走配方 reorder-bar。
 */
import { presenceAttr } from "../dom/flag";

import type { JSX } from "solid-js";

import { reorderBarAttrs } from "./reorder-policy";
import "./ReorderBar.css";

/** 等一帧再 ready，避免首帧还没布局就画换位条。 */
export function scheduleReorderBarReady(
  setReady: (ready: boolean) => void,
  cleanup: (fn: () => void) => void,
): void {
  if (typeof requestAnimationFrame === "function") {
    const readyFrame = requestAnimationFrame(() => setReady(true));
    cleanup(() => cancelAnimationFrame(readyFrame));
  } else {
    setReady(true);
  }
}

export function ReorderBar(props: { open: boolean; y: number; ready: boolean }): JSX.Element {
  const attrs = () => reorderBarAttrs(props.open, props.y);
  return (
    <div
      class="yohu-recipe-reorder-bar"
      data-open={attrs()["data-open"]}
      data-ready={presenceAttr(props.ready)}
      style={attrs().style}
      aria-hidden="true"
    />
  );
}