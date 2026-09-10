/**
 * 复选框领域模型（L2）。
 * 勾选是不变式；涂装名给视图当 data-paint。
 * 不碰 DOM、不判定 disabled。
 */

export type CheckboxPaintKind = "idle" | "checked";

export interface CheckboxInput {
  checked?: boolean;
}

export interface CheckboxSpec {
  checked: boolean;
}

export function resolveCheckboxSpec(input: CheckboxInput): CheckboxSpec {
  return { checked: Boolean(input.checked) };
}

/** CSS 只消费这个名字。disabled 由 L3 另写，不进涂装。 */
export function checkboxPaintKind(spec: CheckboxSpec): CheckboxPaintKind {
  return spec.checked ? "checked" : "idle";
}
