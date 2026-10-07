/**
 * 右键菜单落点策略（L3）。按视口夹紧，避免贴边时整块溢出。
 * 打开时先按条目估算宽高夹紧（`clampContextMenuPoint`）；菜单挂载后应再以
 * **实测** `offsetWidth/offsetHeight` 二次夹紧（placement `clampToRect`），
 * 因为 `Layout.MenuMin` 只是最小宽，更宽条目会让估算偏小，贴右/下边时会溢出。
 * 上下展开不走浮层 `placePopover`。夹紧数字在 placement。
 */

import { clampToRect } from "../placement/clamp";
import { controlRowHeight } from "../tokens";
import { Layout } from "../tokens/layout";
import { Spacing } from "../tokens/spacing";

export function estimateContextMenuHeight(itemCount: number): number {
  const rows = Math.max(1, itemCount);
  return Spacing.Xs * 2 + rows * controlRowHeight();
}

export function clampContextMenuPoint(
  x: number,
  y: number,
  itemCount: number,
  viewport: { width: number; height: number },
): { x: number; y: number } {
  return clampToRect(x, y, { width: Layout.MenuMin, height: estimateContextMenuHeight(itemCount) }, viewport);
}
