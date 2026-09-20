/**
 * 输入框交互策略（L3）。
 * 禁用与清除显隐、数字步进显隐与触边禁用是同一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import {
  canStepTextFieldNumber,
  resolveTextFieldMaxRows,
  resolveTextFieldRows,
  resolveTextFieldSpec,
  resolveTextFieldStatus,
  resolveTextFieldStepper,
  textFieldPaintKind,
  type TextFieldPaintKind,
  type TextFieldSlotInput,
  type TextFieldStepDirection,
  type TextFieldWidthKind,
  type YoTextFieldStatus,
} from "./textfield-model";

export interface TextFieldInteractiveInput {
  disabled?: boolean;
  readOnly?: boolean;
  clearable?: boolean;
  value?: string;
  status?: string;
}

export interface TextFieldInteractive {
  disabled: boolean;
  readOnly: boolean;
  showClear: boolean;
  status: YoTextFieldStatus;
}

/** 禁用同时关掉输入与清除。只读可点选复制，仍隐藏清除。只降透明度仍算可改，不算禁用。 */
export function resolveTextFieldInteractive(
  input: TextFieldInteractiveInput,
): TextFieldInteractive {
  const disabled = Boolean(input.disabled);
  const readOnly = Boolean(input.readOnly);
  const value = input.value ?? "";
  return {
    disabled,
    readOnly,
    showClear: Boolean(input.clearable) && value.length > 0 && !disabled && !readOnly,
    status: resolveTextFieldStatus(input.status),
  };
}

export interface TextFieldHostAttrs {
  "data-status": YoTextFieldStatus;
  "data-paint": TextFieldPaintKind;
  "data-width": TextFieldWidthKind;
  "data-prefix": true | undefined;
  "data-suffix": true | undefined;
  "data-addon-before": true | undefined;
  "data-addon-after": true | undefined;
  "data-tokens": true | undefined;
  "data-clearable": true | undefined;
  "data-disabled": true | undefined;
  "data-readonly": true | undefined;
  "data-active": true | undefined;
  "data-multiline": true | undefined;
  "data-stepper": true | undefined;
  "data-font": "mono" | undefined;
  disabled: boolean;
  readOnly: boolean;
  "aria-invalid": true | undefined;
  rows: number;
  maxRows: number;
}

export function textFieldHostAttrs(
  input: TextFieldSlotInput &
    TextFieldInteractiveInput & {
      width?: TextFieldWidthKind;
      block?: boolean;
      type?: string;
      active?: boolean;
      multiline?: boolean;
      rows?: number;
      maxRows?: number;
      font?: "ui" | "mono";
    },
): TextFieldHostAttrs {
  const spec = resolveTextFieldSpec(input);
  const interactive = resolveTextFieldInteractive(input);
  const stepper = resolveTextFieldStepper(input);
  return {
    "data-status": spec.status,
    "data-paint": textFieldPaintKind(spec.status),
    "data-width": spec.width,
    "data-prefix": spec.slots.prefix ? true : undefined,
    "data-suffix": spec.slots.suffix ? true : undefined,
    "data-addon-before": spec.slots.addonBefore ? true : undefined,
    "data-addon-after": spec.slots.addonAfter ? true : undefined,
    "data-tokens": spec.slots.tokens ? true : undefined,
    "data-clearable": interactive.showClear ? true : undefined,
    "data-disabled": interactive.disabled ? true : undefined,
    "data-readonly": interactive.readOnly ? true : undefined,
    "data-active": spec.active ? true : undefined,
    "data-multiline": spec.multiline ? true : undefined,
    "data-stepper": stepper ? true : undefined,
    "data-font": input.font === "mono" ? "mono" : undefined,
    disabled: interactive.disabled,
    readOnly: interactive.readOnly,
    "aria-invalid": spec.status === "error" ? true : undefined,
    rows: resolveTextFieldRows({ multiline: spec.multiline, rows: spec.rows }),
    maxRows: resolveTextFieldMaxRows({
      multiline: spec.multiline,
      rows: spec.rows,
      maxRows: input.maxRows,
    }),
  };
}

export interface TextFieldStepperInput {
  type?: string;
  multiline?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  value?: string;
  min?: number;
  max?: number;
}

export interface TextFieldStepperState {
  show: boolean;
  incrementDisabled: boolean;
  decrementDisabled: boolean;
}

function stepperLocked(input: TextFieldStepperInput): boolean {
  return Boolean(input.disabled) || Boolean(input.readOnly);
}

function stepperDirDisabled(input: TextFieldStepperInput, direction: TextFieldStepDirection): boolean {
  return stepperLocked(input) || !canStepTextFieldNumber({ ...input, direction });
}

/** 步进柱显隐与两向禁用。触边、禁用、只读都关对应钮。不写色。 */
export function textFieldStepperState(input: TextFieldStepperInput): TextFieldStepperState {
  const show = resolveTextFieldStepper(input);
  if (!show) {
    return { show: false, incrementDisabled: true, decrementDisabled: true };
  }
  return {
    show: true,
    incrementDisabled: stepperDirDisabled(input, 1),
    decrementDisabled: stepperDirDisabled(input, -1),
  };
}
