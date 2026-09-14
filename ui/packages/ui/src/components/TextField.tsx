/**
 * YoTextField —— 输入框（L4 视图）。
 * 盒内缀 / 盒外缀 / status / active / 禁用 / 多行由 textfield-model + textfield-policy 决定；本文件只绑属性与槽位。
 * HarmonyOS 对照：TextInput / TextArea 同一门面；status 边走语义 token，不引进 antd Input。
 */
import { Show, createMemo, createUniqueId } from "solid-js";
import type { JSX } from "solid-js";
import { Icon, isIconName, type IconName } from "../icons";
import { Layout } from "../tokens/layout";
import type { YoTextFieldStatus } from "./textfield-model";
import { textFieldHostAttrs } from "./textfield-policy";
import "./TextField.css";

export type { YoTextFieldStatus };

export type YoTextFieldControl = HTMLInputElement | HTMLTextAreaElement;

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
  /** 只读：可点选复制，不可改。不是 disabled。 */
  readOnly?: boolean;
  /** 有值时显示清除按钮 */
  clearable?: boolean;
  /** 输入类型，默认 text。multiline 时忽略。 */
  type?: string;
  /** 多行。同一门面，不是 YoTextArea。 */
  multiline?: boolean;
  /** 多行可见行数。默认 2。 */
  rows?: number;
  /** 盒内前缀（图标名或节点） */
  prefix?: YoTextFieldAffix;
  /** 盒内后缀（图标名或节点） */
  suffix?: YoTextFieldAffix;
  /** 写入盒内、输入前的 Token 槽（过滤气泡）。 */
  tokens?: JSX.Element;
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
  /** 转发内部 input / textarea，供宿主快捷键聚焦。不进模型。 */
  inputRef?: (el: YoTextFieldControl) => void;
  /** 转发内部 input 的 keydown（Token 退格删泡等）。 */
  onKeyDown?: (event: KeyboardEvent) => void;
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

/** 渲染输入。内容区 = 盒内缀 + Token（无盒，气泡升为 flex 子项）+ input/textarea + 清除；写入盒只 clip。 */
export function YoTextField(props: YoTextFieldProps): JSX.Element {
  const id = createUniqueId();
  let inputRef: YoTextFieldControl | undefined;
  const host = createMemo(() => textFieldHostAttrs(props));

  const bindControl = (el: YoTextFieldControl): void => {
    inputRef = el;
    props.inputRef?.(el);
  };

  const handleInput = (event: InputEvent): void => {
    const target = event.currentTarget as YoTextFieldControl;
    props.onInput?.(target.value, event);
  };

  /** UIA ValuePattern.SetValue 有时只触发 change，不走 input。 */
  const handleChange = (event: Event): void => {
    const target = event.currentTarget as YoTextFieldControl;
    props.onInput?.(target.value, event as InputEvent);
  };

  const handleClear = (): void => {
    if (host().disabled || host().readOnly) return;
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
      data-tokens={host()["data-tokens"]}
      data-width={host()["data-width"]}
      data-clearable={host()["data-clearable"]}
      data-disabled={host()["data-disabled"]}
      data-readonly={host()["data-readonly"]}
      data-active={host()["data-active"]}
      data-multiline={host()["data-multiline"]}
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
        <div
          class="yohu-text-field__control yohu-focus-host"
          onMouseDown={(event) => {
            if (!inputRef || event.button !== 0) return;
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest("button, a, [data-no-focus]")) return;
            if (target === inputRef || inputRef.contains(target)) return;
            event.preventDefault();
            inputRef.focus();
          }}
        >
          <Show when={host()["data-prefix"]}>
            <span class="yohu-text-field__affix" data-edge="start">
              <TextFieldAffix value={props.prefix} />
            </span>
          </Show>
          <Show when={host()["data-tokens"]}>
            <span class="yohu-text-field__tokens">{props.tokens}</span>
          </Show>
          <Show
            when={host()["data-multiline"]}
            fallback={
              <input
                ref={(el) => bindControl(el)}
                id={id}
                class="yohu-text-field__input"
                type={props.type ?? "text"}
                size={1}
                value={props.value ?? ""}
                placeholder={props.placeholder ?? ""}
                aria-label={props.ariaLabel ?? props.label}
                aria-invalid={host()["aria-invalid"]}
                disabled={host().disabled}
                readOnly={host().readOnly}
                onInput={handleInput}
                onChange={handleChange}
                onKeyDown={(event) => props.onKeyDown?.(event)}
              />
            }
          >
            <textarea
              ref={(el) => bindControl(el)}
              id={id}
              class="yohu-text-field__input"
              rows={host().rows}
              value={props.value ?? ""}
              placeholder={props.placeholder ?? ""}
              aria-label={props.ariaLabel ?? props.label}
              aria-invalid={host()["aria-invalid"]}
              disabled={host().disabled}
              readOnly={host().readOnly}
              onInput={handleInput}
              onChange={handleChange}
              onKeyDown={(event) => props.onKeyDown?.(event)}
            />
          </Show>
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
