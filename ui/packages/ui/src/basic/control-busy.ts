/**
 * 加载同时关掉输入并报 busy。按钮和图标按钮共用这一把。
 * 只降透明度仍算可点，不算禁用。
 */
import { trueAttr } from "../dom/flag";

export interface ControlBusyInput {
  disabled?: boolean;
  loading?: boolean;
}

export interface ControlBusy {
  disabled: boolean;
  busy: boolean;
}

/** 缺省不算禁用。 */
export function controlIsDisabled(disabled?: boolean): boolean {
  return disabled === true;
}

/** 缺省不铺满。 */
export function controlIsBlock(block?: boolean): boolean {
  return block === true;
}

/** 缺省不算勾选。复选框和开关都认这一把。 */
export function controlIsChecked(input: { checked?: boolean }): boolean {
  return Boolean(input.checked);
}

export function resolveControlBusy(input: ControlBusyInput): ControlBusy {
  const busy = Boolean(input.loading);
  return {
    disabled: controlIsDisabled(input.disabled) || busy,
    busy,
  };
}

export function controlBusyAttr(busy: boolean): true | undefined {
  return trueAttr(busy);
}
