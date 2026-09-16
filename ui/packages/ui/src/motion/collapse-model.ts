/**
 * 折叠领域模型（L2）。
 * 开闭与配方是不变式；不碰 DOM、不测 scrollHeight。
 * collapse / panel / fill：高度 0fr/1fr，只在高度不确定的流里成立。
 * 对话框名单不走 Collapse；那是 YoReveal 的布局轴。
 */

import type { CollapseRecipe } from "./recipes";

export type { CollapseRecipe };

export const DEFAULT_COLLAPSE_RECIPE: CollapseRecipe = "collapse";

export interface CollapseInput {
  open?: boolean;
  recipe?: CollapseRecipe;
}

export interface CollapseSpec {
  open: boolean;
  recipe: CollapseRecipe;
}

export function resolveCollapseRecipe(recipe?: CollapseRecipe): CollapseRecipe {
  return recipe ?? DEFAULT_COLLAPSE_RECIPE;
}

export function resolveCollapseSpec(input: CollapseInput): CollapseSpec {
  return {
    open: Boolean(input.open),
    recipe: resolveCollapseRecipe(input.recipe),
  };
}

export type CollapseRows = "0fr" | "1fr";

/** 行高只认 open。禁止为 Dialog 再开一条特殊行。 */
export function resolveCollapseRows(open: boolean): CollapseRows {
  return open ? "1fr" : "0fr";
}
