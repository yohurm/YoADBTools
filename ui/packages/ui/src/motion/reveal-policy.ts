/**
 * 揭示槽策略（L3）。
 * 视图只绑 data-open / data-layout。高度交给祖先 YoTravel；裁切交给消费方主槽。
 */

import { resolveRevealLayout, type RevealLayout } from "./reveal-model";

export interface RevealHostAttrs {
  "data-open": "true" | "false";
  "data-layout": RevealLayout;
}

export function revealHostAttrs(open: boolean): RevealHostAttrs {
  return {
    "data-open": open ? "true" : "false",
    "data-layout": resolveRevealLayout(open),
  };
}
