/**
 * 按钮交互策略（L3）。
 * 禁用与加载是同一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import {
  buttonPaintKind,
  resolveButtonSpec,
  type ButtonInput,
  type ButtonPaintKind,
  type YoButtonSize,
  type YoButtonTone,
  type YoButtonVariant,
} from "./button-model";

export interface ButtonInteractiveInput {
  disabled?: boolean;
  loading?: boolean;
}

export interface ButtonInteractive {
  disabled: boolean;
  busy: boolean;
}

/** loading 同时关掉输入并报 busy。只降透明度仍算可点，不算禁用。 */
export function resolveButtonInteractive(input: ButtonInteractiveInput): ButtonInteractive {
  const busy = Boolean(input.loading);
  return {
    disabled: Boolean(input.disabled) || busy,
    busy,
  };
}

export interface ButtonHostAttrs {
  "data-variant": YoButtonVariant;
  "data-tone": YoButtonTone;
  "data-size": YoButtonSize;
  "data-paint": ButtonPaintKind;
  disabled: boolean;
  "aria-busy": true | undefined;
}

export function buttonHostAttrs(input: ButtonInput & ButtonInteractiveInput): ButtonHostAttrs {
  const spec = resolveButtonSpec(input);
  const interactive = resolveButtonInteractive(input);
  return {
    "data-variant": spec.variant,
    "data-tone": spec.tone,
    "data-size": spec.size,
    "data-paint": buttonPaintKind(spec),
    disabled: interactive.disabled,
    "aria-busy": interactive.busy ? true : undefined,
  };
}
