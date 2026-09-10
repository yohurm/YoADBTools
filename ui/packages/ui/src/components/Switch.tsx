/**
 * YoSwitch —— 列表/设置行开关（L4 视图）。
 * 开/关 / 禁用由 switch-model + switch-policy 决定；本文件只绑属性与滑块。
 * HarmonyOS 对照：ToggleType.Switch；默认 36×20vp。
 *
 * 只点击开关本身（不响应整行）。role=switch。
 */
import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { switchHostAttrs, switchNextChecked } from "./switch-policy";
import "./Switch.css";

export interface YoSwitchProps {
  /** 是否开启 */
  checked?: boolean;
  /** 状态变化 */
  onChange?: (checked: boolean) => void;
  /** 无障碍名称（设置行标签在左侧时必填） */
  ariaLabel: string;
  /** 禁用 */
  disabled?: boolean;
}

/** 渲染开关。内容区 = 轨内滑块，胶囊内裁剪。 */
export function YoSwitch(props: YoSwitchProps): JSX.Element {
  const host = createMemo(() => switchHostAttrs(props));

  const handleClick = (): void => {
    const next = switchNextChecked(host()["data-checked"] === "true", host().disabled);
    if (next === null) return;
    props.onChange?.(next);
  };

  return (
    <button
      type="button"
      role="switch"
      class="yohu-switch yohu-focus-ring"
      data-checked={host()["data-checked"]}
      data-paint={host()["data-paint"]}
      data-disabled={host()["data-disabled"]}
      aria-checked={host()["aria-checked"]}
      aria-label={props.ariaLabel}
      disabled={host().disabled}
      onClick={handleClick}
    >
      <span class="yohu-switch__thumb" aria-hidden="true" />
    </button>
  );
}
