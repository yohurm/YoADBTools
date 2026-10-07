/**
 * 输入框交互策略（L3）。
 * 禁用与清除显隐、数字步进显隐与触边禁用是同一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */
import { presenceAttr } from "../dom/flag";
import { controlIsDisabled } from "../basic/control-busy";

import {
  fieldPaintKind,
  fieldStatusInvalid,
  resolveFieldStatus,
  type FieldPaintKind,
  type FieldStatus,
} from "./field-status";
import {
  canStepTextFieldNumber,
  resolveTextFieldMaxRows,
  resolveTextFieldRows,
  resolveTextFieldSpec,
  textFieldFontIsMono,
  textFieldIsNumber,
  textFieldTextPresent,
  type TextFieldFont,
  type TextFieldSlotInput,
  type TextFieldStepDirection,
  type TextFieldWidthKind,
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
  status: FieldStatus;
}

/** 缺省可改。只读可点选复制，仍隐藏清除。 */
function fieldIsReadOnly(readOnly?: boolean): boolean {
  return readOnly === true;
}

/** 禁用同时关掉输入与清除。只读可点选复制，仍隐藏清除。只降透明度仍算可改，不算禁用。 */
export function resolveTextFieldInteractive(
  input: TextFieldInteractiveInput,
): TextFieldInteractive {
  const disabled = controlIsDisabled(input.disabled);
  const readOnly = fieldIsReadOnly(input.readOnly);
  const value = input.value ?? "";
  return {
    disabled,
    readOnly,
    showClear: Boolean(input.clearable) && textFieldTextPresent(value) && !disabled && !readOnly,
    status: resolveFieldStatus(input.status),
  };
}

export interface TextFieldHostAttrs {
  "data-status": FieldStatus;
  "data-paint": FieldPaintKind;
  "data-width": TextFieldWidthKind;
  "data-prefix": "" | undefined;
  "data-suffix": "" | undefined;
  "data-addon-before": "" | undefined;
  "data-addon-after": "" | undefined;
  "data-tokens": "" | undefined;
  "data-clearable": "" | undefined;
  "data-disabled": "" | undefined;
  "data-readonly": "" | undefined;
  "data-active": "" | undefined;
  "data-multiline": "" | undefined;
  "data-stepper": "" | undefined;
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
      font?: TextFieldFont;
    },
): TextFieldHostAttrs {
  const spec = resolveTextFieldSpec(input);
  const interactive = resolveTextFieldInteractive(input);
  const stepper = textFieldIsNumber(input);
  return {
    "data-status": spec.status,
    "data-paint": fieldPaintKind(spec.status),
    "data-width": spec.width,
    "data-prefix": presenceAttr(spec.slots.prefix),
    "data-suffix": presenceAttr(spec.slots.suffix),
    "data-addon-before": presenceAttr(spec.slots.addonBefore),
    "data-addon-after": presenceAttr(spec.slots.addonAfter),
    "data-tokens": presenceAttr(spec.slots.tokens),
    "data-clearable": presenceAttr(interactive.showClear),
    "data-disabled": presenceAttr(interactive.disabled),
    "data-readonly": presenceAttr(interactive.readOnly),
    "data-active": presenceAttr(spec.active),
    "data-multiline": presenceAttr(spec.multiline),
    "data-stepper": presenceAttr(stepper),
    "data-font": textFieldFontIsMono(input.font) ? "mono" : undefined,
    disabled: interactive.disabled,
    readOnly: interactive.readOnly,
    "aria-invalid": fieldStatusInvalid(spec.status),
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
  return controlIsDisabled(input.disabled) || fieldIsReadOnly(input.readOnly);
}

function stepperDirDisabled(input: TextFieldStepperInput, direction: TextFieldStepDirection): boolean {
  return stepperLocked(input) || !canStepTextFieldNumber({ ...input, direction });
}

/** 步进柱显隐与两向禁用。触边、禁用、只读都关对应钮。不写色。 */
export function textFieldStepperState(input: TextFieldStepperInput): TextFieldStepperState {
  const show = textFieldIsNumber(input);
  if (!show) {
    return { show: false, incrementDisabled: true, decrementDisabled: true };
  }
  return {
    show: true,
    incrementDisabled: stepperDirDisabled(input, 1),
    decrementDisabled: stepperDirDisabled(input, -1),
  };
}
