/**
 * 复选框交互策略（L3）。
 * 禁用是唯一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import {
  checkboxPaintKind,
  resolveCheckboxSpec,
  type CheckboxInput,
  type CheckboxPaintKind,
} from "./checkbox-model";

export interface CheckboxInteractiveInput {
  disabled?: boolean;
}

export interface CheckboxInteractive {
  disabled: boolean;
}

export function resolveCheckboxInteractive(input: CheckboxInteractiveInput): CheckboxInteractive {
  return { disabled: Boolean(input.disabled) };
}

/** 禁用拒绝提交。视图不得自行 if 判定后再读一份 checked。 */
export function canCommitCheckboxChange(disabled: boolean): boolean {
  return !disabled;
}

export interface CheckboxHostAttrs {
  "data-checked": "true" | "false";
  "data-paint": CheckboxPaintKind;
  "data-disabled": true | undefined;
  disabled: boolean;
}

export function checkboxHostAttrs(input: CheckboxInput & CheckboxInteractiveInput): CheckboxHostAttrs {
  const spec = resolveCheckboxSpec(input);
  const interactive = resolveCheckboxInteractive(input);
  return {
    "data-checked": spec.checked ? "true" : "false",
    "data-paint": checkboxPaintKind(spec),
    "data-disabled": interactive.disabled ? true : undefined,
    disabled: interactive.disabled,
  };
}
