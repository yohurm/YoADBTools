/**
 * YoPanel —— 画布上的卡片/分区唯一容器（L4 视图）。
 * 变体 / 内边距 / 顶栏 / 内容区排布由 panel-model + panel-policy 决定；本文件只绑属性与内容区。
 * 铬走 YoCorner（role=card=16）；阴影仍在外壳。禁止 CSS border + overflow:hidden 画圆角。
 */
import { Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { YoCorner } from "../corner";
import {
  resolvePanelEdge,
  resolvePanelEdgeOutset,
  type YoPanelAlign,
  type YoPanelEdge,
  type YoPanelGap,
  type YoPanelOverflow,
  type YoPanelPadding,
  type YoPanelVariant,
} from "./panel-model";
import { panelHostAttrs } from "./panel-policy";
import "./Panel.css";

export type {
  YoPanelAlign,
  YoPanelEdge,
  YoPanelGap,
  YoPanelOverflow,
  YoPanelPadding,
  YoPanelVariant,
};

export interface YoPanelProps {
  /** 面板标题 */
  title?: string;
  /** 标题行右侧操作（清屏、关闭等） */
  actions?: JSX.Element;
  /** 自定义顶栏（路径栏等）；出现时替代 title/actions */
  header?: JSX.Element;
  /** 内边距；card 默认 md，pane 默认 none */
  padding?: YoPanelPadding;
  /** 块轴内边距，叠在 padding 上；未设则不另写 */
  paddingBlock?: YoPanelPadding;
  /** 内容区交叉轴对齐；默认 stretch */
  align?: YoPanelAlign;
  /** 内容区间隙；默认 none */
  gap?: YoPanelGap;
  /** 内容区两轴溢出；pane 默认 hidden（只裁切），card 默认 visible。禁止分轴、禁止系统条。 */
  overflow?: YoPanelOverflow;
  /** 默认 card */
  variant?: YoPanelVariant;
  /** 外壳高光；默认 none。drop = 填充盒外一圈虚线，不占用描边 */
  edge?: YoPanelEdge;
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
      paddingBlock: props.paddingBlock,
      align: props.align,
      gap: props.gap,
      overflow: props.overflow,
      edge: props.edge,
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
      data-align={host()["data-align"]}
      data-gap={host()["data-gap"]}
      data-overflow={host()["data-overflow"]}
      data-padding-block={host()["data-padding-block"]}
      data-edge={host()["data-edge"]}
      aria-label={props["aria-label"]}
    >
      <YoCorner
        role="card"
        class="yohu-panel__clip"
        edgeOutset={resolvePanelEdgeOutset(resolvePanelEdge(props.edge))}
      >
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
      </YoCorner>
    </section>
  );
}
