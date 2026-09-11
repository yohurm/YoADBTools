/**
 * 列表换位浮层（L4）。跟指针的抬起行副本；不进公开门面。
 */

import type { JSX } from "solid-js";

import { reorderOverlayAttrs } from "./reorder-policy";
import "./ReorderOverlay.css";

export function ReorderOverlay(props: {
  open: boolean;
  y: number;
  height: number;
  ready: boolean;
  children: JSX.Element;
}): JSX.Element {
  const attrs = () => reorderOverlayAttrs(props.open, props.y, props.height);
  return (
    <div
      class="yohu-recipe-reorder-overlay"
      data-open={attrs()["data-open"]}
      data-ready={props.ready ? "" : undefined}
      style={attrs().style}
      aria-hidden="true"
    >
      {props.children}
    </div>
  );
}
