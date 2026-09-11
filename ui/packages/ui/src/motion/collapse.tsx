/**
 * YoCollapse —— 高度 0fr/1fr 过渡（动画系统-v6.md 配方 collapse / panel / fill）。
 * 子树保持挂载以便插值；关闭时 aria-hidden + inert。
 * panel：Fluent 双轨（高度空间 + 内容淡入上移），供传输列表等面板级折叠。
 * fill：高度仍 collapse；内层 column flex，直接子级填满并可收缩（设备栏 42% 帽下纵滚）。
 */
import type { JSX } from "solid-js";
import type { CollapseRecipe } from "./recipes";

export type { CollapseRecipe };

export interface YoCollapseProps {
  open: boolean;
  /** 默认 collapse（仅高度）。panel = 高度 + 内容淡入上移。fill = 内层填满可收缩。 */
  recipe?: CollapseRecipe;
  children: JSX.Element;
}

export function YoCollapse(props: YoCollapseProps): JSX.Element {
  return (
    <div
      class="yohu-collapse"
      data-open={props.open ? "true" : "false"}
      data-recipe={props.recipe ?? "collapse"}
    >
      <div class="yohu-collapse__inner" aria-hidden={!props.open || undefined} inert={!props.open ? true : undefined}>
        {props.children}
      </div>
    </div>
  );
}
