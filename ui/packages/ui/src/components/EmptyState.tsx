/**
 * YoEmptyState（L4 视图）。
 * 插画 + 标题 + 描述 + 可选 action 槽；不是 Dialog。
 * 出现/消失直切，禁止本组件写 transition。
 */
import { Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import { Layout } from "../tokens/layout";
import { emptyStateHostAttrs } from "./empty-policy";
import "./EmptyState.css";

export interface YoEmptyStateProps {
  /** 插画图标名 */
  icon?: IconName;
  /** 标题 */
  title: string;
  /** 描述 */
  description?: string;
  /** 可选 action 槽（按钮等）。不是 Dialog children */
  action?: JSX.Element;
}

/** 渲染一个居中的空状态占位。内容区 = 插画 + 文案 + action。 */
export function YoEmptyState(props: YoEmptyStateProps): JSX.Element {
  const host = createMemo(() =>
    emptyStateHostAttrs({
      title: props.title,
      description: props.description,
      hasIcon: Boolean(props.icon),
      hasAction: props.action != null,
    }),
  );
  return (
    <div
      class="yohu-empty-state"
      data-has-icon={host()["data-has-icon"]}
      data-has-action={host()["data-has-action"]}
    >
      <Show when={props.icon}>
        {(icon) => (
          <div class="yohu-empty-state__illustration">
            <Icon name={icon()} size={Layout.IconLg} />
          </div>
        )}
      </Show>
      <div class="yohu-empty-state__title">{props.title}</div>
      <Show when={props.description}>
        {(description) => <div class="yohu-empty-state__description">{description()}</div>}
      </Show>
      <Show when={props.action}>
        {(action) => <div class="yohu-empty-state__action">{action()}</div>}
      </Show>
    </div>
  );
}
