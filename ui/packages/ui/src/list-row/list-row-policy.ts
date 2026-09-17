/**
 * 清单行策略（L3）。
 * 只组装行盒 data-*。投放框走 list-frame。
 */

import {
  DEFAULT_LIST_ROW_TONE,
  resolveListRowChrome,
  type YoListRowFill,
  type YoListRowRadius,
  type YoListRowTone,
} from "./list-row-model";

export interface ListRowHostInput {
  tone?: YoListRowTone;
  selected?: boolean;
  hot?: boolean;
  selectable?: boolean;
  selectedKeys?: ReadonlySet<string | number>;
}

export interface ListRowHostAttrs {
  "data-tone": YoListRowTone;
  "data-fill": Exclude<YoListRowFill, "none"> | undefined;
  "data-selectable": "" | undefined;
  "data-radius": Exclude<YoListRowRadius, "none"> | undefined;
}

export function listRowHostAttrs(input: ListRowHostInput): ListRowHostAttrs {
  const chrome = resolveListRowChrome(input);
  return {
    "data-tone": input.tone ?? DEFAULT_LIST_ROW_TONE,
    "data-fill": chrome.fill === "none" ? undefined : chrome.fill,
    "data-selectable": input.selectable ? "" : undefined,
    "data-radius": chrome.radius === "none" ? undefined : chrome.radius,
  };
}
