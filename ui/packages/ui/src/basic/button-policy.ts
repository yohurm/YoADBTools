/**
 * 按钮交互策略（L3）。
 * 禁用与加载是同一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬、不发明 data-paint。
 */

import {
  resolveButtonSpec,
  type ButtonInput,
  type YoButtonSize,
  type YoButtonStyle,
  type YoButtonTone,
} from "./button-model";

export interface ButtonInteractiveInput {
  disabled?: boolean;
  loading?: boolean;
  /** 铺满父级（发送栏收起条）。默认 hug */
  block?: boolean;
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
  "data-style": YoButtonStyle;
  "data-tone": YoButtonTone;
  "data-size": YoButtonSize;
  disabled: boolean;
  "aria-busy": true | undefined;
  "data-block"?: true;
}

export function buttonHostAttrs(input: ButtonInput & ButtonInteractiveInput): ButtonHostAttrs {
  const spec = resolveButtonSpec(input);
  const interactive = resolveButtonInteractive(input);
  return {
    "data-style": spec.buttonStyle,
    "data-tone": spec.tone,
    "data-size": spec.size,
    disabled: interactive.disabled,
    "aria-busy": interactive.busy ? true : undefined,
    ...(input.block ? { "data-block": true as const } : {}),
  };
}
