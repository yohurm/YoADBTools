/**
 * YoDescriptionList —— 键值描述表（L4）。
 * HarmonyOS 对照：文本一级/三级层级；预览元数据、关于页只读对。
 */
import { For, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { resolveDescriptionListSpec, type YoDescriptionItem } from "./description-list-model";
import "./DescriptionList.css";

export type { YoDescriptionItem };

export interface YoDescriptionListProps {
  items: readonly YoDescriptionItem[];
  class?: string;
}

export function YoDescriptionList(props: YoDescriptionListProps): JSX.Element {
  const spec = createMemo(() => resolveDescriptionListSpec({ items: props.items }));
  return (
    <dl class={`yohu-description-list${props.class ? ` ${props.class}` : ""}`}>
      <For each={spec().items}>
        {(item) => (
          <>
            <dt class="yohu-description-list__term">{item.term}</dt>
            <dd class="yohu-description-list__detail">{item.detail}</dd>
          </>
        )}
      </For>
    </dl>
  );
}
