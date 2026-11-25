/**
 * 折叠领域模型（L2）。
 * 开闭、配方与轴是不变式；不碰 DOM、不测 scrollHeight。
 *
 * 插值（0fr↔1fr）：collapse / panel / fill。轴只换插值的那根轨道名——
 * block 裁高度（grid-template-rows），inline 裁宽度（grid-template-columns）。
 * 可打断的 transition 就是这两根，与 Presence 的 clip 同一套分轴。
 * inline 只在宿主自己 hug、窗格锁宽贴 inline-end 时成立；槽变窄不得让窗格折行。
 * hug 不是第四个 recipe：默认 collapse 在 auto 流里跟内容身高，
 * 不吃父级确定高剩余（DeviceRail 无设备）；fill 才让 __content 吃剩余高。
 * 对话框名单不走 Collapse；那是 YoReveal 的布局轴。
 */

import { logicalAxisIsBlock, type LogicalAxis } from "../../../placement/axis";
import type { MotionSpecName } from "../../../tokens/motion";
import type { CollapseRecipe } from "../../spec/recipes";

export type { CollapseRecipe };

/** 走 0fr↔1fr 的配方。hug 是 auto 流布局结果，不在此列。 */
export const COLLAPSE_INTERPOLATE_RECIPES = ["collapse", "panel", "fill"] as const;

export const DEFAULT_COLLAPSE_RECIPE: CollapseRecipe = "collapse";

/** 裁切轴。跟轨槽、行程共用同一份逻辑轴词汇。 */
export const DEFAULT_COLLAPSE_AXIS: LogicalAxis = "block";

export function resolveCollapseAxis(axis?: LogicalAxis): LogicalAxis {
  return logicalAxisIsBlock(axis ?? DEFAULT_COLLAPSE_AXIS) ? "block" : "inline";
}

function collapseAxisIsInline(axis?: LogicalAxis): boolean {
  return resolveCollapseAxis(axis) === "inline";
}

/** 折叠根在父级 flex 里怎么占位。缺省不写，树行不会被拉高。inline 走 hug 才让列宽跟窗格。 */
export type CollapseFlex = "grow" | "hug";

export interface CollapseInput {
  open?: boolean;
  recipe?: CollapseRecipe;
  flex?: CollapseFlex;
  axis?: LogicalAxis;
}

export interface CollapseSpec {
  open: boolean;
  recipe: CollapseRecipe;
  axis: LogicalAxis;
}

export function resolveCollapseRecipe(recipe?: CollapseRecipe): CollapseRecipe {
  return recipe ?? DEFAULT_COLLAPSE_RECIPE;
}

/** 未知值不当一种新占位。 */
export function resolveCollapseFlex(flex?: CollapseFlex): CollapseFlex | undefined {
  return flex === "grow" || flex === "hug" ? flex : undefined;
}

export function resolveCollapseSpec(input: CollapseInput): CollapseSpec {
  return {
    open: Boolean(input.open),
    recipe: resolveCollapseRecipe(input.recipe),
    axis: resolveCollapseAxis(input.axis),
  };
}

export type CollapseTrack = "0fr" | "1fr";

/** 轨道只认 open，两轴同一对。禁止为 Dialog 再开一条特殊轨道。 */
export function resolveCollapseTrack(open: boolean): CollapseTrack {
  return open ? "1fr" : "0fr";
}

/** 折叠行程 CSS 属性：行向裁高度，列向裁宽度。Scroller 订 traveling()，禁止 scrape 这根名。 */
export function collapseTripProperty(
  axis?: LogicalAxis,
): "grid-template-rows" | "grid-template-columns" {
  return collapseAxisIsInline(axis) ? "grid-template-columns" : "grid-template-rows";
}

/** inline 走 spatialPanel（标准曲线）；block panel 走尺寸软弹簧；其余局部折叠走 spatialLocal。 */
export function resolveCollapseTripSpec(recipe?: CollapseRecipe, axis?: LogicalAxis): MotionSpecName {
  if (collapseAxisIsInline(axis)) return "spatialPanel";
  return resolveCollapseRecipe(recipe) === "panel" ? "spatialStretch" : "spatialLocal";
}

/** 减动效不当行程：开闭当拍到位，滚条可立刻计量。 */
export function resolveCollapseTripOnToggle(skipMotion: boolean): boolean {
  return !skipMotion;
}

/**
 * 内容身高先画出 0fr，再跟 open，进页时已经为开的树组才有高度过渡。
 * fill 吃剩余高，出生即跟 open，避免设备列表先塌再撑开。
 * 减动效直接跟意图。
 */
export function collapseDelaysPaint(recipe: CollapseRecipe | undefined, skipMotion: boolean): boolean {
  if (skipMotion) return false;
  return resolveCollapseRecipe(recipe) !== "fill";
}

/** 画出的开闭。内容身高在关闭帧画出前保持关，即使意图已经为开。 */
export function collapsePaintOpen(open: boolean, delay: boolean, revealed: boolean): boolean {
  if (!open) return false;
  if (!delay) return true;
  return revealed;
}
