/**
 * YoFormRow —— 表单/设置行默认排布（L4 视图）。
 * 槽位由 formrow-model + formrow-policy 决定；本文件只绑属性与两列内容区。
 * HarmonyOS 对照：列表项「内容左、操作右」，右侧与内容间距 12vp。
 * 不是 YoForm 引擎：不收集值、不校验、不提交。
 */
import type { JSX } from "solid-js";
import { Show, createMemo } from "solid-js";
import { hasFormRowSlot } from "./formrow-model";
import { formRowHostAttrs } from "./formrow-policy";
import "./FormRow.css";

export interface YoFormRowProps {
  /** 标题 */
  title: string;
  /** 副标题 / 说明 */
  description?: JSX.Element;
  /** 备注（生效徽章等），跟在标题同一行后面 */
  note?: JSX.Element;
  /** 额外 class */
  class?: string;
  classList?: Record<string, boolean | undefined>;
  /** 右侧设置内容 */
  children: JSX.Element;
}

/** 渲染一行「左信息、右控件」。页面不要再自写这套 flex。 */
export function YoFormRow(props: YoFormRowProps): JSX.Element {
  const host = createMemo(() => formRowHostAttrs(props));

  return (
    <div
      class={`yohu-form-row${props.class ? ` ${props.class}` : ""}`}
      classList={props.classList}
      data-has-description={host()["data-has-description"]}
      data-has-note={host()["data-has-note"]}
    >
      <div class="yohu-form-row__info">
        <div class="yohu-form-row__heading">
          <div class="yohu-form-row__title">{props.title}</div>
          <Show when={hasFormRowSlot(props.note)}>
            <div class="yohu-form-row__note">{props.note}</div>
          </Show>
        </div>
        <Show when={hasFormRowSlot(props.description)}>
          <div class="yohu-form-row__description">{props.description}</div>
        </Show>
      </div>
      <div class="yohu-form-row__control">{props.children}</div>
    </div>
  );
}
