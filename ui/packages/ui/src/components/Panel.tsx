/**
 * YoPanel —— 画布上的卡片/分区唯一容器（L4 视图）。
 * 变体 / 内边距 / 顶栏形态由 panel-model + panel-policy 决定；本文件只绑属性与内容区。
 * 铬（surface + radius-md + hairline + XS 阴影）只写在 Panel.css。
 */
import { Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import type { YoPanelPadding, YoPanelVariant } from "./panel-model";
import { panelHostAttrs } from "./panel-policy";
import "./Panel.css";

export type { YoPanelPadding, YoPanelVariant };

export interface YoPanelProps {
  /** 面板标题 */
  title?: string;
  /** 标题行右侧操作（清屏、关闭等） */
  actions?: JSX.Element;
  /** 自定义顶栏（路径栏等）；出现时替代 title/actions */
  header?: JSX.Element;
  /** 内边距；card 默认 md，pane 默认 none */
  padding?: YoPanelPadding;
  /** 默认 card */
  variant?: YoPanelVariant;
  class?: string;
  classList?: Record<string, boolean | undefined>;
  "aria-label"?: string;
  children: JSX.Element;
}

/** 渲染圆角卡片分区。模块分区一律走本组件，不要再铺 surface + radius-md。 */
export function YoPanel(props: YoPanelProps): JSX.Element {
  const host = createMemo(() =>
    panelHostAttrs({
      variant: props.variant,
      padding: props.padding,
      header: Boolean(props.header),
      title: Boolean(props.title),
      actions: Boolean(props.actions),
    }),
  );

  return (
    <section
      class={`yohu-panel${props.class ? ` ${props.class}` : ""}`}
      classList={props.classList}
      data-variant={host()["data-variant"]}
      data-padding={host()["data-padding"]}
      data-header={host()["data-header"]}
      aria-label={props["aria-label"]}
    >
      <div class="yohu-panel__clip">
        <Show when={host()["data-header"] === "custom"}>
          <div class="yohu-panel__header">{props.header}</div>
        </Show>
        <Show when={host()["data-header"] === "pane"}>
          <header class="yohu-panel__header">
            <Show when={props.title}>
              <h3 class="yohu-panel__heading">{props.title}</h3>
            </Show>
            <Show when={props.actions}>
              <div class="yohu-panel__actions">{props.actions}</div>
            </Show>
          </header>
        </Show>
        <Show when={host()["data-header"] === "card-title"}>
          <h3 class="yohu-panel__title">{props.title}</h3>
        </Show>
        <div class="yohu-panel__body">{props.children}</div>
      </div>
    </section>
  );
}
