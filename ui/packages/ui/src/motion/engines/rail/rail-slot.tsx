/**
 * YoRailSlot —— 轨内文案槽。开流 1fr，关流 0fr；字走同一拍位移+淡出。
 * 禁止 display:none。
 */
import type { JSX } from "solid-js";

import { useRail } from "./rail";
import { railSlotOpen } from "./rail-model";

export type RailSlotAxis = "block" | "inline";

export interface YoRailSlotProps {
  axis?: RailSlotAxis;
  /** 壳外单测；在 YoRail 内跟文案流。 */
  open?: boolean;
  class?: string;
  children: JSX.Element;
}

export function YoRailSlot(props: YoRailSlotProps): JSX.Element {
  const rail = useRail();
  const axis = () => props.axis ?? "block";
  const open = () => props.open ?? railSlotOpen(rail?.phase() ?? "expanded");

  return (
    <div
      class={["yohu-rail-slot", props.class].filter(Boolean).join(" ")}
      data-axis={axis()}
      data-open={open() ? "true" : undefined}
      aria-hidden={!open() || undefined}
    >
      <div class="yohu-rail-slot__inner">
        <div class="yohu-rail-slot__content">{props.children}</div>
      </div>
    </div>
  );
}
