/**
 * 按钮交互策略（L3）。
 * 禁用与加载是同一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬、不发明 data-paint。
 */
import { presenceAttr } from "../dom/flag";
import { controlBusyAttr, controlIsBlock, resolveControlBusy } from "./control-busy";
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

export interface ButtonHostAttrs {
  "data-style": YoButtonStyle;
  "data-tone": YoButtonTone;
  "data-size": YoButtonSize;
  disabled: boolean;
  "aria-busy": true | undefined;
  "data-block": "" | undefined;
}

/** loading 同时关掉输入并报 busy。判定在 resolveControlBusy。 */
export function buttonHostAttrs(input: ButtonInput & ButtonInteractiveInput): ButtonHostAttrs {
  const spec = resolveButtonSpec(input);
  const interactive = resolveControlBusy(input);
  return {
    "data-style": spec.buttonStyle,
    "data-tone": spec.tone,
    "data-size": spec.size,
    disabled: interactive.disabled,
    "aria-busy": controlBusyAttr(interactive.busy),
    "data-block": presenceAttr(controlIsBlock(input.block)),
  };
}
