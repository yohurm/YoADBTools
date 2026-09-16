/**
 * 图标按钮交互策略（L3）。
 * 禁用与加载是同一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import {
  resolveIconButtonSpec,
  type IconButtonInput,
  type YoIconButtonSize,
} from "./icon-button-model";

export interface IconButtonInteractiveInput {
  disabled?: boolean;
  loading?: boolean;
  pressed?: boolean;
  ariaPressed?: boolean;
}

export interface IconButtonInteractive {
  disabled: boolean;
  busy: boolean;
  pressed: boolean;
}

/** loading 同时关掉输入并报 busy。只降透明度仍算可点，不算禁用。 */
export function resolveIconButtonInteractive(input: IconButtonInteractiveInput): IconButtonInteractive {
  const busy = Boolean(input.loading);
  return {
    disabled: Boolean(input.disabled) || busy,
    busy,
    pressed: Boolean(input.pressed),
  };
}

/** 显式 aria-pressed 优先；否则 pressed 才是切换钮。 */
export function resolveIconButtonAriaPressed(input: IconButtonInteractiveInput): boolean | undefined {
  if (input.ariaPressed !== undefined) return input.ariaPressed;
  return input.pressed ? true : undefined;
}

export interface IconButtonHostAttrs {
  "data-size": YoIconButtonSize;
  "data-pressed": "" | undefined;
  "data-busy": "" | undefined;
  disabled: boolean;
  "aria-busy": true | undefined;
  "aria-pressed": boolean | undefined;
}

export function iconButtonHostAttrs(
  input: IconButtonInput & IconButtonInteractiveInput,
): IconButtonHostAttrs {
  const spec = resolveIconButtonSpec(input);
  const interactive = resolveIconButtonInteractive(input);
  return {
    "data-size": spec.size,
    "data-pressed": interactive.pressed ? "" : undefined,
    "data-busy": interactive.busy ? "" : undefined,
    disabled: interactive.disabled,
    "aria-busy": interactive.busy ? true : undefined,
    "aria-pressed": resolveIconButtonAriaPressed(input),
  };
}
