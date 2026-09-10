/**
 * 设置行布局策略（L3）。
 * 只组装槽位 data-*；不校验、不绑定字段、不画铬。
 */

import { hasFormRowSlot, resolveFormRowSlots, type FormRowSlotInput } from "./formrow-model";

export interface FormRowHostAttrs {
  "data-has-description": true | undefined;
  "data-has-note": true | undefined;
}

export function formRowHostAttrs(input: FormRowSlotInput): FormRowHostAttrs {
  const slots = resolveFormRowSlots(input);
  return {
    "data-has-description": slots.description ? true : undefined,
    "data-has-note": slots.note ? true : undefined,
  };
}

export function shouldRenderFormRowSlot(value: unknown): boolean {
  return hasFormRowSlot(value);
}
