/**
 * YoFormRow —— 表单/设置行默认排布（L4 视图）。
 * 槽位由 formrow-model + formrow-policy 决定；本文件只绑属性与两列内容区。
 * HarmonyOS 对照：列表项「内容左、操作右」，右侧与内容间距 12vp。
 * 不是 YoForm 引擎：不收集值、不校验、不提交。
 */
import type { JSX } from "solid-js";
import { Show, createMemo } from "solid-js";
import { YoCollapse } from "../motion/engines/collapse";
import { formRowSubIsOpen, hasFormRowSlot, type YoFormRowLayout, type YoFormRowPad } from "./formrow-model";
import { formRowHostAttrs } from "./formrow-policy";
import "./FormRow.css";

export type { YoFormRowLayout, YoFormRowPad };

export interface YoFormRowProps {
  /** 标题 */
  title: string;
  /** 排布。默认 row（左信息右控件）；stacked 用于窄栏纵排 */
  layout?: YoFormRowLayout;
  /** 行垫。默认 md（设置卡）；flush 给对话框里已有 gap 的纵排字段 */
  pad?: YoFormRowPad;
  /** 副标题 / 说明 */
  description?: JSX.Element;
  /** 备注（生效徽章等），跟在标题同一行后面 */
  note?: JSX.Element;
  /** 子项标题。缩进在主行下方，不是并列主项 */
  subTitle?: string;
  /** 子项是否展开。缺省：有子项就开 */
  subOpen?: boolean;
  /** 子项内容。开闭高度走 YoCollapse */
  sub?: JSX.Element;
  /** 额外 class */
  class?: string;
  classList?: Record<string, boolean | undefined>;
  /** 右侧设置内容 */
  children: JSX.Element;
}

/** 渲染一行「左信息、右控件」。有子项时缩进在下方，高度走折叠。页面不要再自写这套 flex。 */
export function YoFormRow(props: YoFormRowProps): JSX.Element {
  const host = createMemo(() => formRowHostAttrs(props));

  function rowSubOpen(): boolean {
    return formRowSubIsOpen(props.sub, props.subOpen);
  }

  return (
    <div
      class={`yohu-form-row${props.class ? ` ${props.class}` : ""}`}
      classList={props.classList}
      data-has-description={host()["data-has-description"]}
      data-has-note={host()["data-has-note"]}
      data-has-sub={host()["data-has-sub"]}
      data-layout={host()["data-layout"]}
      data-pad={host()["data-pad"]}
    >
      <div class="yohu-form-row__line">
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
      <Show when={hasFormRowSlot(props.sub)}>
        <div class="yohu-form-row__sub-slot">
          <YoCollapse open={rowSubOpen()}>
            <div class="yohu-form-row__sub">
              <Show when={hasFormRowSlot(props.subTitle)}>
                <div class="yohu-form-row__sub-title">
                  <svg class="yohu-form-row__sub-arc" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M2 2 A12 12 0 0 0 14 14" />
                  </svg>
                  <span class="yohu-form-row__sub-label">{props.subTitle}</span>
                </div>
              </Show>
              <div class="yohu-form-row__sub-body">{props.sub}</div>
            </div>
          </YoCollapse>
        </div>
      </Show>
    </div>
  );
}
