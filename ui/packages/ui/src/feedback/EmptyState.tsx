/**
 * YoEmptyState（L4 视图）。
 * 插画 + 标题 + 描述 + 可选 action 槽；不是 Dialog。
 * 出现/消失直切，禁止本组件写 transition。
 */
import { Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { presenceIsOn } from "../dom/flag";
import { Icon, type IconName } from "../icons";
import { Layout } from "../tokens/layout";
import { emptyStateDescription, emptyStateHostAttrs, type EmptyStateSize } from "./empty-policy";
import "./EmptyState.css";

export type { EmptyStateSize };

export interface YoEmptyStateProps {
  /** 插画图标名 */
  icon?: IconName;
  /** 标题 */
  title: string;
  /** 描述 */
  description?: string;
  /** 可选 action 槽（按钮等）。不是 Dialog children */
  action?: JSX.Element;
  /** 在父级剩余空间内伸展并居中。不是盖住下层。默认 hug */
  fill?: boolean;
  /** md=页/面板；sm=窄栏 hug（设备栏） */
  size?: EmptyStateSize;
}

/** 渲染一个居中的空状态占位。内容区 = 插画 + 文案 + action。 */
export function YoEmptyState(props: YoEmptyStateProps): JSX.Element {
  const input = createMemo(() => ({
    title: props.title,
    description: props.description,
    hasIcon: Boolean(props.icon),
    hasAction: props.action != null,
    fill: props.fill,
    size: props.size,
  }));
  const host = createMemo(() => emptyStateHostAttrs(input()));
  const description = () => emptyStateDescription(input());
  return (
    <div
      class="yohu-empty-state"
      data-has-icon={host()["data-has-icon"]}
      data-has-action={host()["data-has-action"]}
      data-fill={host()["data-fill"]}
      data-size={host()["data-size"]}
    >
      <Show when={presenceIsOn(host()["data-has-icon"])}>
        <div class="yohu-empty-state__illustration">
          <Icon name={props.icon as IconName} size={Layout.IconLg} />
        </div>
      </Show>
      <div class="yohu-empty-state__title">{props.title}</div>
      <Show when={description()}>
        {(text) => <div class="yohu-empty-state__description">{text()}</div>}
      </Show>
      <Show when={props.action}>
        {(action) => <div class="yohu-empty-state__action">{action()}</div>}
      </Show>
    </div>
  );
}
