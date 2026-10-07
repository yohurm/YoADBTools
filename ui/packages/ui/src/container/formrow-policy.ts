/**
 * 设置行布局策略（L3）。
 * 只组装槽位 data-*；不校验、不绑定字段、不画铬。
 */
import { presenceAttr } from "../dom/flag";

import {
  formRowLayoutIsStacked,
  formRowPadIsFlush,
  resolveFormRowSlots,
  type FormRowSlotInput,
  type YoFormRowLayout,
  type YoFormRowPad,
} from "./formrow-model";

export interface FormRowHostAttrs {
  "data-has-description": "" | undefined;
  "data-has-note": "" | undefined;
  "data-layout"?: "stacked";
  "data-pad"?: "flush";
}

export function formRowHostAttrs(
  input: FormRowSlotInput & { layout?: YoFormRowLayout; pad?: YoFormRowPad },
): FormRowHostAttrs {
  const slots = resolveFormRowSlots(input);
  return {
    "data-has-description": presenceAttr(slots.description),
    "data-has-note": presenceAttr(slots.note),
    ...(formRowLayoutIsStacked(input.layout) ? { "data-layout": "stacked" as const } : {}),
    ...(formRowPadIsFlush(input.pad) ? { "data-pad": "flush" as const } : {}),
  };
}
