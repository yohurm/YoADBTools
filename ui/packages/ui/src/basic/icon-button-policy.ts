/**
 * 图标按钮交互策略（L3）。
 * 禁用与加载是同一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */
import { presenceAttr, trueAttr } from "../dom/flag";

import { controlBusyAttr, resolveControlBusy } from "./control-busy";
import {
  resolveIconButtonSpec,
  type IconButtonInput,
  type ControlIconSize,
  type YoIconButtonPaint,
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

/** loading 同时关掉输入并报 busy。按下是图标钮自己的事实。 */
export function resolveIconButtonInteractive(input: IconButtonInteractiveInput): IconButtonInteractive {
  return {
    ...resolveControlBusy(input),
    pressed: Boolean(input.pressed),
  };
}

/** 显式 aria-pressed 优先；否则 pressed 才是切换钮。 */
export function resolveIconButtonAriaPressed(input: IconButtonInteractiveInput): boolean | undefined {
  if (input.ariaPressed !== undefined) return input.ariaPressed;
  return trueAttr(Boolean(input.pressed));
}

export interface IconButtonHostAttrs {
  "data-size": ControlIconSize;
  "data-paint": YoIconButtonPaint | undefined;
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
    "data-paint": spec.paint,
    "data-pressed": presenceAttr(interactive.pressed),
    "data-busy": presenceAttr(interactive.busy),
    disabled: interactive.disabled,
    "aria-busy": controlBusyAttr(interactive.busy),
    "aria-pressed": resolveIconButtonAriaPressed(input),
  };
}
