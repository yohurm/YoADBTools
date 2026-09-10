/**
 * YoLoading（L4 视图）。
 * 区域/页面等待；控件内加载仍走 YoButton / YoIconButton.loading。
 * 环走 tokens/motion.css 的 yohu-spin。
 */
import { Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { loadingHostAttrs } from "./loading-policy";
import "./Loading.css";

export interface YoLoadingProps {
  /** 标题 */
  title: string;
  /** 描述 */
  description?: string;
  /** 铺满父级（盖住下层内容，如投屏画布） */
  cover?: boolean;
}

/** 渲染一个居中的加载占位。内容区 = 环 + 文案。 */
export function YoLoading(props: YoLoadingProps): JSX.Element {
  const host = createMemo(() => loadingHostAttrs(props));
  return (
    <div
      class="yohu-loading"
      data-cover={host()["data-cover"]}
      role={host().role}
      aria-busy={host()["aria-busy"]}
      aria-live={host()["aria-live"]}
    >
      <span class="yohu-loading__spinner" aria-hidden="true" />
      <div class="yohu-loading__title">{props.title}</div>
      <Show when={props.description}>
        {(description) => <div class="yohu-loading__description">{description()}</div>}
      </Show>
    </div>
  );
}
