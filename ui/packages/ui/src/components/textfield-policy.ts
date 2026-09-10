/**
 * 输入框交互策略（L3）。
 * 禁用与清除显隐是同一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import {
  resolveTextFieldSpec,
  textFieldPaintKind,
  type TextFieldPaintKind,
  type TextFieldSlotInput,
  type YoTextFieldStatus,
} from "./textfield-model";

export interface TextFieldInteractiveInput {
  disabled?: boolean;
  clearable?: boolean;
  value?: string;
  status?: string;
}

export interface TextFieldInteractive {
  disabled: boolean;
  showClear: boolean;
  status: YoTextFieldStatus;
}

/** 禁用同时关掉输入与清除。只降透明度仍算可改，不算禁用。 */
export function resolveTextFieldInteractive(
  input: TextFieldInteractiveInput,
): TextFieldInteractive {
  const spec = resolveTextFieldSpec(input);
  const disabled = Boolean(input.disabled);
  const value = input.value ?? "";
  return {
    disabled,
    showClear: Boolean(input.clearable) && value.length > 0 && !disabled,
    status: spec.status,
  };
}

export interface TextFieldHostAttrs {
  "data-status": YoTextFieldStatus;
  "data-paint": TextFieldPaintKind;
  "data-prefix": true | undefined;
  "data-suffix": true | undefined;
  "data-addon-before": true | undefined;
  "data-addon-after": true | undefined;
  "data-clearable": true | undefined;
  "data-disabled": true | undefined;
  disabled: boolean;
  "aria-invalid": true | undefined;
}

export function textFieldHostAttrs(
  input: TextFieldSlotInput & TextFieldInteractiveInput,
): TextFieldHostAttrs {
  const spec = resolveTextFieldSpec(input);
  const interactive = resolveTextFieldInteractive(input);
  return {
    "data-status": spec.status,
    "data-paint": textFieldPaintKind(spec.status),
    "data-prefix": spec.slots.prefix ? true : undefined,
    "data-suffix": spec.slots.suffix ? true : undefined,
    "data-addon-before": spec.slots.addonBefore ? true : undefined,
    "data-addon-after": spec.slots.addonAfter ? true : undefined,
    "data-clearable": interactive.showClear ? true : undefined,
    "data-disabled": interactive.disabled ? true : undefined,
    disabled: interactive.disabled,
    "aria-invalid": spec.status === "error" ? true : undefined,
  };
}
