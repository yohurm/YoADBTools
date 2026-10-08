/**
 * YoOpsItem —— 操作项内容（L4，列表族）。
 * 只排名称与可选尾槽。选中、换位、行线由清单功能集决定，不在本组件。
 * 不 import 滚动族视图。
 */
import { Show } from "solid-js";
import type { JSX } from "solid-js";
import "./OpsItem.css";

export interface YoOpsItemProps {
  title: string;
  trailing?: JSX.Element;
}

export function YoOpsItem(props: YoOpsItemProps): JSX.Element {
  return (
    <div class="yohu-ops-item">
      <span class="yohu-ops-item__title">{props.title}</span>
      <Show when={props.trailing}>
        {(trailing) => <span class="yohu-ops-item__trailing">{trailing()}</span>}
      </Show>
    </div>
  );
}
