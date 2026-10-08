/**
 * YoCheckbox —— 复选框（L4 视图）。
 * 勾选 / 禁用由 checkbox-model + checkbox-policy 决定；本文件只绑属性与内容区。
 * HarmonyOS 对照：Checkbox；启用类场景改走 YoSwitch。
 */
import { Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { YoCorner } from "../corner";
import { Icon, type IconName } from "../icons";
import { Radius } from "../tokens/radius";
import { flagIsOn } from "../dom/flag";
import { canCommitCheckboxChange, checkboxHostAttrs, type CheckboxTone } from "./checkbox-policy";
import "./Checkbox.css";

export interface YoCheckboxProps {
  /** 是否勾选 */
  checked?: boolean;
  /** 勾选状态变化回调 */
  onChange?: (checked: boolean) => void;
  /** 标签文本 */
  label?: string;
  /** 盒与标签之间的种类图标 */
  icon?: IconName;
  /** body=条目；section=分组标题，墨水对齐列表型 SubHeader */
  tone?: CheckboxTone;
  /** 禁用 */
  disabled?: boolean;
  /** 铺满所在行。缺省 hug，调用方不得再点 .yohu-checkbox 写 flex。 */
  block?: boolean;
}

/** 渲染复选框。圆角盒内裁勾；可选种类图标在盒与标签之间。 */
export function YoCheckbox(props: YoCheckboxProps): JSX.Element {
  const host = createMemo(() => checkboxHostAttrs(props));

  function checkboxPaint(): ReturnType<typeof checkboxHostAttrs>["data-paint"] {
    return host()["data-paint"];
  }

  function checkboxDisabled(): boolean {
    return host().disabled;
  }

  const handleChange = (event: Event): void => {
    if (!canCommitCheckboxChange(checkboxDisabled())) return;
    const target = event.currentTarget as HTMLInputElement;
    props.onChange?.(target.checked);
  };

  return (
    <label
      class="yohu-checkbox"
      data-checked={host()["data-checked"]}
      data-paint={checkboxPaint()}
      data-disabled={host()["data-disabled"]}
      data-block={host()["data-block"]}
      data-tone={host()["data-tone"]}
    >
      <span class="yohu-checkbox__box yohu-focus-host" data-paint={checkboxPaint()}>
        <YoCorner role="control" radius={Radius.Xs} class="yohu-checkbox__chrome" align="center" justify="center">
          <input
            type="checkbox"
            class="yohu-checkbox__input"
            checked={flagIsOn(host()["data-checked"])}
            disabled={checkboxDisabled()}
            onChange={handleChange}
          />
          {/* 勾选符常挂。路径从短臂起笔（4,12 → 9,17 → 20,6），dashoffset 1→0 沿笔顺画勾。 */}
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
            <polyline points="4 12 9 17 20 6" pathLength={1} />
          </svg>
        </YoCorner>
      </span>
      <Show when={props.icon}>
        {(name) => (
          <span class="yohu-checkbox__mark">
            <Icon name={name()} />
          </span>
        )}
      </Show>
      <Show when={props.label}>
        <span class="yohu-checkbox__label">{props.label}</span>
      </Show>
    </label>
  );
}
