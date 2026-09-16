/**
 * 设置行领域模型（L2）。
 * 槽位占有是不变式；不是表单引擎，不持有字段值。
 * 不碰 DOM、不判定控件 disabled。
 */

export type YoFormRowLayout = "row" | "stacked";
export const DEFAULT_FORM_ROW_LAYOUT: YoFormRowLayout = "row";

export interface FormRowSlotInput {
  description?: unknown;
  note?: unknown;
}

export function resolveFormRowLayout(layout?: YoFormRowLayout): YoFormRowLayout {
  return layout === "stacked" ? "stacked" : DEFAULT_FORM_ROW_LAYOUT;
}

export interface FormRowSlots {
  description: boolean;
  note: boolean;
}

/** 空串 / 空白 / null / false 不算占槽。 */
export function hasFormRowSlot(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function resolveFormRowSlots(input: FormRowSlotInput): FormRowSlots {
  return {
    description: hasFormRowSlot(input.description),
    note: hasFormRowSlot(input.note),
  };
}
