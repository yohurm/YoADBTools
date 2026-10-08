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
import { presenceAttr } from "../dom/flag";

export interface ListRowHostInput {
  tone?: YoListRowTone;
  selected?: boolean;
  hot?: boolean;
  selectable?: boolean;
  selectedKeys?: ReadonlySet<string | number>;
  radius?: "chip";
}

export interface ListRowHostAttrs {
  "data-tone": YoListRowTone;
  "data-fill": Exclude<YoListRowFill, "none"> | undefined;
  "data-selectable": "" | undefined;
  "data-radius": Exclude<YoListRowRadius, "none"> | undefined;
}

export function listRowHostAttrs(input: ListRowHostInput): ListRowHostAttrs {
  const chrome = resolveListRowChrome({
    tone: input.tone,
    selected: input.selected,
    hot: input.hot,
    selectable: input.selectable,
    selectedKeys: input.selectedKeys,
    radius: input.radius,
  });
  return {
    "data-tone": input.tone ?? DEFAULT_LIST_ROW_TONE,
    "data-fill": chrome.fill === "none" ? undefined : chrome.fill,
    "data-selectable": presenceAttr(input.selectable),
    "data-radius": chrome.radius === "none" ? undefined : chrome.radius,
  };
}
