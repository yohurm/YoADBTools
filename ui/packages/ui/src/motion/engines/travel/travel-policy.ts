/**
 * 尺寸行程策略（L3）。
 * used = 本拍起程。没有 hold 相。落定不留 data-travel。
 * 配方只点 spec，不含选择器。
 */

import { logicalAxesHaveBlock, logicalAxesHaveInline, type LogicalAxis } from "../../../placement/axis";
import { normalizeTravelAxes } from "./travel-model";
import { presenceAttr } from "../../../dom/flag";

export type TravelAttr = "used";

export interface TravelPaint {
  travel?: TravelAttr;
  height?: number;
  width?: number;
}

export interface TravelHostAttrs {
  "data-travel": TravelAttr;
  "data-axis-block"?: "";
  "data-axis-inline"?: "";
}

export function travelHostAttrs(axes?: readonly LogicalAxis[]): TravelHostAttrs {
  const next = normalizeTravelAxes(axes);
  return {
    "data-travel": "used",
    "data-axis-block": presenceAttr(logicalAxesHaveBlock(next)),
    "data-axis-inline": presenceAttr(logicalAxesHaveInline(next)),
  };
}

export function travelAxisAttrs(axes?: readonly LogicalAxis[]): Pick<TravelHostAttrs, "data-axis-block" | "data-axis-inline"> {
  const next = travelHostAttrs(axes);
  return {
    "data-axis-block": next["data-axis-block"],
    "data-axis-inline": next["data-axis-inline"],
  };
}
