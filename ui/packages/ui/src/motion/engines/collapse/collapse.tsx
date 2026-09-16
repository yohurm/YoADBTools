/**
 * YoCollapse —— 高度槽（动画系统-v6.md）。
 * collapse / panel / fill：0fr/1fr。对话框名单走 YoReveal，不走 Collapse。
 * 子树保持挂载；关闭时 aria-hidden + inert。
 * `__inner` 只裁切高度。`__content` 是配方自己的动画盒。
 * 禁止把位移打在裁切盒上，禁止选择器穿到消费者子树。
 */
import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { collapseHostAttrs } from "./collapse-policy";
import type { CollapseRecipe } from "./collapse-model";

export type { CollapseRecipe };

export interface YoCollapseProps {
  open: boolean;
  /** 默认 collapse（仅高度）。panel = 高度 + 内容淡入上移。fill = 内层填满可收缩。 */
  recipe?: CollapseRecipe;
  children: JSX.Element;
}

export function YoCollapse(props: YoCollapseProps): JSX.Element {
  const host = createMemo(() => collapseHostAttrs({ open: props.open, recipe: props.recipe }));
  return (
    <div class="yohu-collapse" data-open={host()["data-open"]} data-recipe={host()["data-recipe"]}>
      <div class="yohu-collapse__inner" aria-hidden={!props.open || undefined} inert={!props.open ? true : undefined}>
        <div class="yohu-collapse__content">{props.children}</div>
      </div>
    </div>
  );
}
