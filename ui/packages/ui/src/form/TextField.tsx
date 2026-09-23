/**
 * YoTextField —— 输入框（L4 视图）。
 * 盒内缀 / 盒外缀 / status / active / 禁用 / 多行 / 数字步进由 textfield-model + textfield-policy 决定；本文件只绑属性与槽位。
 * HarmonyOS 对照：TextInput / TextArea 同一门面；status 边走语义 token，不引进 antd Input。
 * 弱多行用后高走 UA field-sizing；盒高交给公开 YoGrow。禁止从 `\n` 推行数。
 */
import { Show, createMemo, createRenderEffect, createUniqueId, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { YoCorner } from "../corner";
import { Icon, isIconName, type IconName } from "../icons";
import { ClearMark } from "./clear-mark";
import { GROW_USED_ATTR, YoGrow, growUsedAttrs, useGrow } from "../motion/engines/grow";
import { Layout } from "../tokens/layout";
import { Radius } from "../tokens/radius";
import { bindTextFieldGrow } from "./textfield-grow";
import {
  stepTextFieldNumber,
  type TextFieldStepDirection,
  type TextFieldWidthKind,
  type YoTextFieldStatus,
} from "./textfield-model";
import { textFieldHostAttrs, textFieldStepperState } from "./textfield-policy";
import "./TextField.css";

export type { TextFieldWidthKind, YoTextFieldStatus };

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
  /** 输入类型，默认 text。multiline 时忽略。type=number 左侧写数字、右侧叠步进箭。 */
  type?: string;
  /** 数字下限。仅 type=number。 */
  min?: number;
  /** 数字上限。仅 type=number。 */
  max?: number;
  /** 步进。仅 type=number。默认 1。 */
  step?: number;
  /** 多行。同一门面，不是 YoTextArea。 */
  multiline?: boolean;
  /** 多行可见行数下限。默认 2。 */
  rows?: number;
  /** 弱多行抬高帽。默认 6。超过后写入盒滚动。 */
  maxRows?: number;
  /** 盒内前缀（图标名或自定义节点） */
  prefix?: YoTextFieldAffix;
  /** 盒内后缀（图标名或自定义节点） */
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
  /** 铺满父级定宽（对话框 / 编辑栏）。默认 hug；type=number 走数字槽宽。路径槽用 width=control，禁止 block 套 hug 簇。 */
  block?: boolean;
  /** 宽度契约。未写则 block→fill、type=number→number、否则 hug。control=路径定宽。 */
  width?: TextFieldWidthKind;
  /** 输入字族。默认 ui；命令/路径等用 mono。禁止模块再点 input。 */
  font?: "ui" | "mono";
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

function TextFieldBody(props: {
  id: string;
  host: ReturnType<typeof textFieldHostAttrs>;
  field: YoTextFieldProps;
  stepper: ReturnType<typeof textFieldStepperState>;
  bind: (el: YoTextFieldControl) => void;
  onInput: (event: InputEvent) => void;
  onChange: (event: Event) => void;
  onClear: () => void;
  onStep: (direction: TextFieldStepDirection) => void;
}): JSX.Element {
  return (
    <>
      <Show when={props.host["data-prefix"]}>
        <span class="yohu-text-field__affix" data-edge="start">
          <TextFieldAffix value={props.field.prefix} />
        </span>
      </Show>
      <Show when={props.host["data-tokens"]}>
        <span class="yohu-text-field__tokens">{props.field.tokens}</span>
      </Show>
      <Show
        when={props.host["data-multiline"]}
        fallback={
          <input
            ref={(el) => props.bind(el)}
            id={props.id}
            class="yohu-text-field__input"
            type={props.field.type ?? "text"}
            size={1}
            value={props.field.value ?? ""}
            placeholder={props.field.placeholder ?? ""}
            aria-label={props.field.ariaLabel ?? props.field.label}
            aria-invalid={props.host["aria-invalid"]}
            min={props.field.min}
            max={props.field.max}
            step={props.field.step}
            disabled={props.host.disabled}
            readOnly={props.host.readOnly}
            onInput={props.onInput}
            onChange={props.onChange}
            onKeyDown={(event) => props.field.onKeyDown?.(event)}
          />
        }
      >
        <textarea
          ref={(el) => props.bind(el)}
          id={props.id}
          class="yohu-text-field__input"
          rows={props.host.rows}
          value={props.field.value ?? ""}
          placeholder={props.field.placeholder ?? ""}
          aria-label={props.field.ariaLabel ?? props.field.label}
          aria-invalid={props.host["aria-invalid"]}
          disabled={props.host.disabled}
          readOnly={props.host.readOnly}
          onInput={props.onInput}
          onChange={props.onChange}
          onKeyDown={(event) => props.field.onKeyDown?.(event)}
        />
      </Show>
      <Show when={props.host["data-suffix"]}>
        <span class="yohu-text-field__affix" data-edge="end">
          <TextFieldAffix value={props.field.suffix} />
        </span>
      </Show>
      <Show when={props.host["data-clearable"]}>
        <ClearMark onClear={props.onClear} />
      </Show>
      <Show when={props.stepper.show}>
        <div class="yohu-text-field__stepper" data-no-focus>
          <button
            type="button"
            class="yohu-text-field__step"
            data-dir="up"
            tabindex="-1"
            aria-label="增加"
            disabled={props.stepper.incrementDisabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => props.onStep(1)}
          >
            <Icon name="chevron-up" size={Layout.IconTiny} />
          </button>
          <button
            type="button"
            class="yohu-text-field__step"
            data-dir="down"
            tabindex="-1"
            aria-label="减少"
            disabled={props.stepper.decrementDisabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => props.onStep(-1)}
          >
            <Icon name="chevron-down" size={Layout.IconTiny} />
          </button>
        </div>
      </Show>
    </>
  );
}

function TextFieldControl(props: {
  id: string;
  host: ReturnType<typeof textFieldHostAttrs>;
  chromeRadii: { tl?: number; bl?: number; tr?: number; br?: number } | undefined;
  field: YoTextFieldProps;
  stepper: ReturnType<typeof textFieldStepperState>;
  bindControl: (el: YoTextFieldControl) => void;
  onInput: (event: InputEvent) => void;
  onChange: (event: Event) => void;
  onClear: () => void;
  onStep: (direction: TextFieldStepDirection) => void;
}): JSX.Element {
  const grow = useGrow();
  let inputEl: YoTextFieldControl | undefined;
  let disposeGrow: (() => void) | undefined;
  let growQueued = false;
  let domIntent = false;
  const requestGrow = (fromDom = false): void => {
    if (fromDom) domIntent = true;
    if (growQueued) return;
    growQueued = true;
    queueMicrotask(() => {
      growQueued = false;
      grow?.snapshot();
      grow?.command();
    });
  };

  createRenderEffect(() => {
    props.field.value;
    if (domIntent) {
      domIntent = false;
      return;
    }
    requestGrow();
  });

  onCleanup(() => disposeGrow?.());

  const bind = (el: YoTextFieldControl): void => {
    inputEl = el;
    props.bindControl(el);
    disposeGrow?.();
    disposeGrow = undefined;
    if (!(el instanceof HTMLTextAreaElement)) return;
    disposeGrow = bindTextFieldGrow(el, {
      onIntent: () => requestGrow(true),
    });
  };

  const bodyProps = {
    id: props.id,
    get host() {
      return props.host;
    },
    field: props.field,
    get stepper() {
      return props.stepper;
    },
    bind,
    onInput: props.onInput,
    onChange: props.onChange,
    onClear: props.onClear,
    onStep: props.onStep,
  };

  return (
    <div
      class="yohu-text-field__control yohu-focus-host"
      onMouseDown={(event) => {
        if (!inputEl || event.button !== 0) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("button, a, [data-no-focus]")) return;
        if (target === inputEl || inputEl.contains(target)) return;
        event.preventDefault();
        inputEl.focus();
      }}
    >
      <YoCorner
        role="control"
        class="yohu-text-field__chrome"
        radii={props.chromeRadii}
        direction="row"
        align={props.host["data-multiline"] ? undefined : "center"}
        overflow="hidden"
        pad="inline-sm"
        gap="xs"
      >
        <Show when={!props.host["data-multiline"]}>
          <TextFieldBody {...bodyProps} />
        </Show>
      </YoCorner>
      <Show when={props.host["data-multiline"]}>
        <div class="yohu-text-field__body" data-grow-used={growUsedAttrs()[GROW_USED_ATTR]}>
          <TextFieldBody {...bodyProps} />
        </div>
      </Show>
    </div>
  );
}

/** 渲染输入。内容区 = 盒内缀 + Token（无盒，气泡升为 flex 子项）+ input/textarea + 清除 + number 步进柱；圆角走 YoCorner。 */
export function YoTextField(props: YoTextFieldProps): JSX.Element {
  const id = createUniqueId();
  let inputRef: YoTextFieldControl | undefined;
  const host = createMemo(() => textFieldHostAttrs(props));
  const stepper = createMemo(() =>
    textFieldStepperState({
      type: props.type,
      multiline: props.multiline,
      disabled: props.disabled,
      readOnly: props.readOnly,
      value: props.value,
      min: props.min,
      max: props.max,
    }),
  );
  const chromeRadii = createMemo(() => {
    const before = Boolean(host()["data-addon-before"]);
    const after = Boolean(host()["data-addon-after"]);
    if (!before && !after) return undefined;
    return {
      ...(before ? { tl: 0, bl: 0 } : {}),
      ...(after ? { tr: 0, br: 0 } : {}),
    };
  });

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

  const handleStep = (direction: TextFieldStepDirection): void => {
    if (!stepper().show || host().disabled || host().readOnly) return;
    if (direction > 0 ? stepper().incrementDisabled : stepper().decrementDisabled) return;
    const current = props.value ?? inputRef?.value ?? "";
    const next = stepTextFieldNumber({
      value: current,
      direction,
      min: props.min,
      max: props.max,
      step: props.step,
    });
    if (inputRef) {
      inputRef.value = next;
      inputRef.focus();
    }
    props.onInput?.(next, new InputEvent("input"));
  };

  const controlProps = {
    id,
    get host() {
      return host();
    },
    get chromeRadii() {
      return chromeRadii();
    },
    field: props,
    get stepper() {
      return stepper();
    },
    bindControl,
    onInput: handleInput,
    onChange: handleChange,
    onClear: handleClear,
    onStep: handleStep,
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
      data-stepper={host()["data-stepper"]}
      data-font={host()["data-font"]}
      style={
        host()["data-multiline"]
          ? { "--yohu-text-field-max-rows": String(host().maxRows) }
          : undefined
      }
    >
      <Show when={props.label}>
        <label class="yohu-text-field__label" for={id}>
          {props.label}
        </label>
      </Show>
      <div class="yohu-text-field__group">
        <Show when={host()["data-addon-before"]}>
          <span class="yohu-text-field__addon" data-edge="before">
            <YoCorner
              role="control"
              class="yohu-text-field__addon-chrome"
              radii={{ tl: Radius.Sm, bl: Radius.Sm, tr: 0, br: 0 }}
              direction="row"
              align="center"
              pad="inline-sm"
            >
              {props.addonBefore}
            </YoCorner>
          </span>
        </Show>
        <Show when={host()["data-multiline"]} fallback={<TextFieldControl {...controlProps} />}>
          <YoGrow>
            <TextFieldControl {...controlProps} />
          </YoGrow>
        </Show>
        <Show when={host()["data-addon-after"]}>
          <span class="yohu-text-field__addon" data-edge="after">
            <YoCorner
              role="control"
              class="yohu-text-field__addon-chrome"
              radii={{ tl: 0, bl: 0, tr: Radius.Sm, br: Radius.Sm }}
              direction="row"
              align="center"
              pad="inline-sm"
            >
              {props.addonAfter}
            </YoCorner>
          </span>
        </Show>
      </div>
    </div>
  );
}
