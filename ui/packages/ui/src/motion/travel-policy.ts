/**
 * 尺寸行程策略（L3）。
 * used = 本拍起程。没有 hold 相。落定不留 data-travel。
 * 配方只点 spec，不含选择器。
 */

import { normalizeTravelAxes, type TravelAxis } from "./travel-model";

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

export function travelHostAttrs(axes?: readonly TravelAxis[]): TravelHostAttrs {
  const next = normalizeTravelAxes(axes);
  return {
    "data-travel": "used",
    "data-axis-block": next.includes("block") ? "" : undefined,
    "data-axis-inline": next.includes("inline") ? "" : undefined,
  };
}

export function travelAxisAttrs(axes?: readonly TravelAxis[]): Pick<TravelHostAttrs, "data-axis-block" | "data-axis-inline"> {
  const next = travelHostAttrs(axes);
  return {
    "data-axis-block": next["data-axis-block"],
    "data-axis-inline": next["data-axis-inline"],
  };
}
