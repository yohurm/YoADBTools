/**
 * 折叠领域模型（L2）。
 * 开闭与配方是不变式；不碰 DOM、不测 scrollHeight。
 *
 * 插值（grid-template-rows 0fr↔1fr）：collapse / panel / fill。
 * 只在高度不确定的流里成立。
 * hug 不是第四个 recipe：默认 collapse 在 auto 流里跟内容身高，
 * 不吃父级确定高剩余（DeviceRail 无设备）；fill 才让 __content 吃剩余高。
 * 对话框名单不走 Collapse；那是 YoReveal 的布局轴。
 */

import type { MotionSpecName } from "../../../tokens/motion";
import type { CollapseRecipe } from "../../spec/recipes";

export type { CollapseRecipe };

/** 走 0fr↔1fr 的配方。hug 是 auto 流布局结果，不在此列。 */
export const COLLAPSE_INTERPOLATE_RECIPES = ["collapse", "panel", "fill"] as const;

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

/** 折叠行程 CSS 属性。Scroller 订 traveling()，禁止 scrape 这根名。 */
export const COLLAPSE_TRIP_PROPERTY = "grid-template-rows";

/** panel 走尺寸软弹簧；其余局部折叠走 spatialLocal。 */
export function resolveCollapseTripSpec(recipe?: CollapseRecipe): MotionSpecName {
  return resolveCollapseRecipe(recipe) === "panel" ? "spatialStretch" : "spatialLocal";
}

/** 减动效不当行程：开闭当拍到位，滚条可立刻计量。 */
export function resolveCollapseTripOnToggle(skipMotion: boolean): boolean {
  return !skipMotion;
}
