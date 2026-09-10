/**
 * 开关交互策略（L3）。
 * 禁用与下一次勾选是同一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import {
  resolveSwitchSpec,
  switchPaintKind,
  type SwitchInput,
  type SwitchPaintKind,
} from "./switch-model";

export interface SwitchInteractiveInput {
  disabled?: boolean;
}

export interface SwitchInteractive {
  disabled: boolean;
}

export function resolveSwitchInteractive(input: SwitchInteractiveInput): SwitchInteractive {
  return { disabled: Boolean(input.disabled) };
}

/** 禁用拒绝取反。返回 null 表示不提交。 */
export function switchNextChecked(checked: boolean, disabled: boolean): boolean | null {
  if (disabled) return null;
  return !checked;
}

export interface SwitchHostAttrs {
  "data-checked": "true" | "false";
  "data-paint": SwitchPaintKind;
  "data-disabled": true | undefined;
  disabled: boolean;
  "aria-checked": boolean;
}

export function switchHostAttrs(input: SwitchInput & SwitchInteractiveInput): SwitchHostAttrs {
  const spec = resolveSwitchSpec(input);
  const interactive = resolveSwitchInteractive(input);
  return {
    "data-checked": spec.checked ? "true" : "false",
    "data-paint": switchPaintKind(spec),
    "data-disabled": interactive.disabled ? true : undefined,
    disabled: interactive.disabled,
    "aria-checked": spec.checked,
  };
}
