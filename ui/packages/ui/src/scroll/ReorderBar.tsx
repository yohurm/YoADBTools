/**
 * 列表换位拖拽条（L4）。只在拖动会话 data-open；展开/收回走配方 reorder-bar。
 */

import type { JSX } from "solid-js";

import { reorderBarAttrs } from "./reorder-policy";
import "./ReorderBar.css";

export function ReorderBar(props: { open: boolean; y: number; ready: boolean }): JSX.Element {
  const attrs = () => reorderBarAttrs(props.open, props.y);
  return (
    <div
      class="yohu-recipe-reorder-bar"
      data-open={attrs()["data-open"]}
      data-ready={props.ready ? "" : undefined}
      style={attrs().style}
      aria-hidden="true"
    />
  );
}