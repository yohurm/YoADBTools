/**
 * 设置行布局策略（L3）。
 * 只组装槽位 data-*；不校验、不绑定字段、不画铬。
 */

import {
  resolveFormRowLayout,
  resolveFormRowPad,
  resolveFormRowSlots,
  type FormRowSlotInput,
  type YoFormRowLayout,
  type YoFormRowPad,
} from "./formrow-model";

export interface FormRowHostAttrs {
  "data-has-description": true | undefined;
  "data-has-note": true | undefined;
  "data-layout"?: "stacked";
  "data-pad"?: "flush";
}

export function formRowHostAttrs(
  input: FormRowSlotInput & { layout?: YoFormRowLayout; pad?: YoFormRowPad },
): FormRowHostAttrs {
  const slots = resolveFormRowSlots(input);
  return {
    "data-has-description": slots.description ? true : undefined,
    "data-has-note": slots.note ? true : undefined,
    ...(resolveFormRowLayout(input.layout) === "stacked" ? { "data-layout": "stacked" as const } : {}),
    ...(resolveFormRowPad(input.pad) === "flush" ? { "data-pad": "flush" as const } : {}),
  };
}
