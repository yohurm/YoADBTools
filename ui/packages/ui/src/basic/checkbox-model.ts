/**
 * 复选框领域模型（L2）。
 * 勾选是不变式；涂装名给视图当 data-paint。
 * 不碰 DOM、不判定 disabled。
 */

import { controlIsChecked } from "./control-busy";

export type CheckboxPaintKind = "idle" | "checked";
export type CheckboxTone = "body" | "section";

export const DEFAULT_CHECKBOX_TONE: CheckboxTone = "body";

/** 分组标题墨水。缺省是条目 body。 */
export function checkboxToneIsSection(tone?: string): boolean {
  return tone === "section";
}

export function resolveCheckboxTone(tone?: string): CheckboxTone {
  return checkboxToneIsSection(tone) ? "section" : DEFAULT_CHECKBOX_TONE;
}

export interface CheckboxInput {
  checked?: boolean;
  /** 在父级 flex 行里铺满并可收缩，标签才能省略。缺省 hug。 */
  block?: boolean;
  tone?: CheckboxTone;
}

export interface CheckboxSpec {
  checked: boolean;
}

export function resolveCheckboxSpec(input: CheckboxInput): CheckboxSpec {
  return { checked: controlIsChecked(input) };
}

/** CSS 只消费这个名字。disabled 由 L3 另写，不进涂装。 */
export function checkboxPaintKind(spec: CheckboxSpec): CheckboxPaintKind {
  return spec.checked ? "checked" : "idle";
}
