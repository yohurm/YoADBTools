/**
 * 开关交互策略（L3）。
 * 禁用与下一次勾选是同一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import { presenceAttr, flagAttr, type FlagAttr } from "../dom/flag";
import { controlIsDisabled } from "./control-busy";
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
  return { disabled: controlIsDisabled(input.disabled) };
}

/** 禁用拒绝取反。返回 null 表示不提交。 */
export function switchNextChecked(checked: boolean, disabled: boolean): boolean | null {
  if (disabled) return null;
  return !checked;
}

export interface SwitchHostAttrs {
  "data-checked": FlagAttr;
  "data-paint": SwitchPaintKind;
  "data-disabled": "" | undefined;
  disabled: boolean;
  "aria-checked": boolean;
}

export function switchHostAttrs(input: SwitchInput & SwitchInteractiveInput): SwitchHostAttrs {
  const spec = resolveSwitchSpec(input);
  const interactive = resolveSwitchInteractive(input);
  return {
    "data-checked": flagAttr(spec.checked),
    "data-paint": switchPaintKind(spec),
    "data-disabled": presenceAttr(interactive.disabled),
    disabled: interactive.disabled,
    "aria-checked": spec.checked,
  };
}
