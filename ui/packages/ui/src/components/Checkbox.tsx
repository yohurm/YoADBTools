/**
 * YoCheckbox —— 复选框（L4 视图）。
 * 勾选 / 禁用由 checkbox-model + checkbox-policy 决定；本文件只绑属性与内容区。
 * HarmonyOS 对照：Checkbox；启用类场景改走 YoSwitch。
 */
import { Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { canCommitCheckboxChange, checkboxHostAttrs } from "./checkbox-policy";
import "./Checkbox.css";

export interface YoCheckboxProps {
  /** 是否勾选 */
  checked?: boolean;
  /** 勾选状态变化回调 */
  onChange?: (checked: boolean) => void;
  /** 标签文本 */
  label?: string;
  /** 禁用 */
  disabled?: boolean;
}

/** 渲染复选框。内容区 = 勾选符 + 标签，圆角盒内裁剪。 */
export function YoCheckbox(props: YoCheckboxProps): JSX.Element {
  const host = createMemo(() => checkboxHostAttrs(props));

  const handleChange = (event: Event): void => {
    if (!canCommitCheckboxChange(host().disabled)) return;
    const target = event.currentTarget as HTMLInputElement;
    props.onChange?.(target.checked);
  };

  return (
    <label
      class="yohu-checkbox"
      data-checked={host()["data-checked"]}
      data-paint={host()["data-paint"]}
      data-disabled={host()["data-disabled"]}
    >
      <span class="yohu-checkbox__box yohu-focus-host" data-paint={host()["data-paint"]}>
        <input
          type="checkbox"
          class="yohu-checkbox__input"
          checked={host()["data-checked"] === "true"}
          disabled={host().disabled}
          onChange={handleChange}
        />
        <Show when={host()["data-checked"] === "true"}>
          <svg
            class="yohu-checkbox__check"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width={3}
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </Show>
      </span>
      <Show when={props.label}>
        <span class="yohu-checkbox__label">{props.label}</span>
      </Show>
    </label>
  );
}
