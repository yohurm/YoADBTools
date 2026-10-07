/**
 * 复选框交互策略（L3）。
 * 禁用是唯一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import { presenceAttr, flagAttr, type FlagAttr } from "../dom/flag";
import { controlIsBlock, controlIsDisabled } from "./control-busy";
import {
  checkboxPaintKind,
  resolveCheckboxSpec,
  resolveCheckboxTone,
  type CheckboxInput,
  type CheckboxPaintKind,
  type CheckboxTone,
} from "./checkbox-model";

export type { CheckboxTone };

export interface CheckboxInteractiveInput {
  disabled?: boolean;
}

export interface CheckboxInteractive {
  disabled: boolean;
}

export function resolveCheckboxInteractive(input: CheckboxInteractiveInput): CheckboxInteractive {
  return { disabled: controlIsDisabled(input.disabled) };
}

/** 禁用拒绝提交。视图不得自行 if 判定后再读一份 checked。 */
export function canCommitCheckboxChange(disabled: boolean): boolean {
  return !disabled;
}

export interface CheckboxHostAttrs {
  "data-checked": FlagAttr;
  "data-paint": CheckboxPaintKind;
  "data-disabled": "" | undefined;
  "data-block": "" | undefined;
  "data-tone": CheckboxTone;
  disabled: boolean;
}

export function checkboxHostAttrs(input: CheckboxInput & CheckboxInteractiveInput): CheckboxHostAttrs {
  const spec = resolveCheckboxSpec(input);
  const interactive = resolveCheckboxInteractive(input);
  return {
    "data-checked": flagAttr(spec.checked),
    "data-paint": checkboxPaintKind(spec),
    "data-disabled": presenceAttr(interactive.disabled),
    "data-block": presenceAttr(controlIsBlock(input.block)),
    "data-tone": resolveCheckboxTone(input.tone),
    disabled: interactive.disabled,
  };
}
