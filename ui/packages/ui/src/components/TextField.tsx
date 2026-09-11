/**
 * YoTextField —— 单行输入框（L4 视图）。
 * 盒内缀 / 盒外缀 / status / active / 禁用由 textfield-model + textfield-policy 决定；本文件只绑属性与槽位。
 * HarmonyOS 对照：TextInput；status 边走语义 token，不引进 antd Input。
 */
import { Show, createMemo, createUniqueId } from "solid-js";
import type { JSX } from "solid-js";
import { ICON_NAMES, Icon, type IconName } from "../icons";
import { Layout } from "../tokens/layout";
import type { YoTextFieldStatus } from "./textfield-model";
import { textFieldHostAttrs } from "./textfield-policy";
import "./TextField.css";

export type { YoTextFieldStatus };

/** 盒内缀：图标名或自定义节点。 */
export type YoTextFieldAffix = IconName | JSX.Element;

export interface YoTextFieldProps {
  /** 标签 */
  label?: string;
  /** 受控值 */
  value?: string;
  /** 输入回调（携带新值与原事件） */
  onInput?: (value: string, event: InputEvent) => void;
  /** 占位文本 */
  placeholder?: string;
  /** 无障碍名称（无 label 时使用） */
  ariaLabel?: string;
  /** 禁用 */
  disabled?: boolean;
  /** 有值时显示清除按钮 */
  clearable?: boolean;
  /** 输入类型，默认 text */
  type?: string;
  /** 盒内前缀（图标名或节点） */
  prefix?: YoTextFieldAffix;
  /** 盒内后缀（图标名或节点） */
  suffix?: YoTextFieldAffix;
  /** 盒外前附加 */
  addonBefore?: JSX.Element;
  /** 盒外后附加 */
  addonAfter?: JSX.Element;
  /** 校验态。默认 none */
  status?: YoTextFieldStatus;
  /** 过滤/内容生效描边。与 status 正交，默认关 */
  active?: boolean;
  /** 铺满父级（对话框 / 编辑栏）。默认 hug；type=number 走数字槽宽 */
  block?: boolean;
  /** 转发内部 input，供宿主快捷键聚焦。不进模型。 */
  inputRef?: (el: HTMLInputElement) => void;
}

function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && (ICON_NAMES as readonly string[]).includes(value);
}

/** 渲染盒内缀。图标名走 Icon；其余当内容节点。 */
function TextFieldAffix(props: { value: YoTextFieldAffix | undefined }): JSX.Element {
  const icon = createMemo(() => (isIconName(props.value) ? props.value : undefined));
  return (
    <Show when={icon()} fallback={props.value}>
      {(name) => <Icon name={name()} size={Layout.IconInline} />}
    </Show>
  );
}

/** 渲染输入。内容区 = 盒内缀 + input + 清除，圆角内裁剪。 */
export function YoTextField(props: YoTextFieldProps): JSX.Element {
  const id = createUniqueId();
  let inputRef: HTMLInputElement | undefined;
  const host = createMemo(() => textFieldHostAttrs(props));

  const handleInput = (event: InputEvent): void => {
    const target = event.currentTarget as HTMLInputElement;
    props.onInput?.(target.value, event);
  };

  /** UIA ValuePattern.SetValue 有时只触发 change，不走 input。 */
  const handleChange = (event: Event): void => {
    const target = event.currentTarget as HTMLInputElement;
    props.onInput?.(target.value, event as InputEvent);
  };

  const handleClear = (): void => {
    if (host().disabled) return;
    if (inputRef) {
      inputRef.value = "";
      inputRef.focus();
    }
    props.onInput?.("", new InputEvent("input"));
  };

  return (
    <div
      class="yohu-text-field"
      data-status={host()["data-status"]}
      data-paint={host()["data-paint"]}
      data-prefix={host()["data-prefix"]}
      data-suffix={host()["data-suffix"]}
      data-addon-before={host()["data-addon-before"]}
      data-addon-after={host()["data-addon-after"]}
      data-width={host()["data-width"]}
      data-clearable={host()["data-clearable"]}
      data-disabled={host()["data-disabled"]}
      data-active={host()["data-active"]}
    >
      <Show when={props.label}>
        <label class="yohu-text-field__label" for={id}>
          {props.label}
        </label>
      </Show>
      <div class="yohu-text-field__group">
        <Show when={host()["data-addon-before"]}>
          <span class="yohu-text-field__addon" data-edge="before">
            {props.addonBefore}
          </span>
        </Show>
        <div class="yohu-text-field__control yohu-focus-host">
          <Show when={host()["data-prefix"]}>
            <span class="yohu-text-field__affix" data-edge="start">
              <TextFieldAffix value={props.prefix} />
            </span>
          </Show>
          <input
            ref={(el) => {
              inputRef = el;
              props.inputRef?.(el);
            }}
            id={id}
            class="yohu-text-field__input"
            type={props.type ?? "text"}
            size={1}
            value={props.value ?? ""}
            placeholder={props.placeholder ?? ""}
            aria-label={props.ariaLabel ?? props.label}
            aria-invalid={host()["aria-invalid"]}
            disabled={host().disabled}
            onInput={handleInput}
            onChange={handleChange}
          />
          <Show when={host()["data-suffix"]}>
            <span class="yohu-text-field__affix" data-edge="end">
              <TextFieldAffix value={props.suffix} />
            </span>
          </Show>
          <Show when={host()["data-clearable"]}>
            <button
              type="button"
              class="yohu-text-field__clear yohu-focus-ring"
              aria-label="清除"
              onClick={handleClear}
            >
              <Icon name="close" size={Layout.IconInline} />
            </button>
          </Show>
        </div>
        <Show when={host()["data-addon-after"]}>
          <span class="yohu-text-field__addon" data-edge="after">
            {props.addonAfter}
          </span>
        </Show>
      </div>
    </div>
  );
}
