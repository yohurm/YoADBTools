/**
 * 右键菜单落点策略（L3）。按视口夹紧，避免贴边时整块溢出。
 * 打开时先按标签估算宽、按条目估算高（`clampContextMenuPoint`）；菜单挂载后应再以
 * **实测** `offsetWidth/offsetHeight` 二次夹紧（`clampToRect`）。
 * 宽跟最长标签，帽为 `Layout.MenuMax`，与 List 的 `max-width` 同一条。
 * 上下展开不走浮层 `placePopover`。夹紧数字在 placement。
 */

import { clampToRect } from "../placement/clamp";
import { controlRowHeight } from "../tokens";
import { Layout } from "../tokens/layout";
import { Spacing } from "../tokens/spacing";
import { FontSizes } from "../tokens/typography";

/** 一字按正文 1em 估。首帧夹紧用；挂载后以实测宽为准。 */
function estimateLabelPx(label: string): number {
  return [...label].length * FontSizes.Body;
}

export function estimateContextMenuHeight(itemCount: number): number {
  const rows = Math.max(1, itemCount);
  return Spacing.Xs * 2 + rows * controlRowHeight();
}

/**
 * 菜单宽 = 最长标签 + 两侧 `--yohu-space-md`。
 * 再与内容帽、视口边距取小。与 `ContextMenu.css` 的 padding / max-width 对齐。
 */
export function estimateContextMenuWidth(labels: readonly string[], viewportWidth: number): number {
  const longest = labels.reduce((max, label) => Math.max(max, estimateLabelPx(label)), 0);
  const content = Spacing.Md * 2 + longest;
  const viewportCap = Math.max(0, viewportWidth - Spacing.Lg);
  return Math.min(Layout.MenuMax, viewportCap, content);
}

export interface SubmenuAnchor {
  left: number;
  top: number;
  right: number;
}

/**
 * 二级菜单贴在父项右侧，并向左叠一点，指针能从父项滑进去。
 * 右侧放不下时翻到父项左边。高度再按视口夹紧。
 */
export function placeSubmenu(
  anchor: SubmenuAnchor,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const overlap = Spacing.Xs;
  const roomRight = viewport.width - anchor.right;
  const x = roomRight + overlap >= size.width ? anchor.right - overlap : anchor.left - size.width + overlap;
  return clampToRect(x, anchor.top, size, viewport);
}

export function clampContextMenuPoint(
  x: number,
  y: number,
  labels: readonly string[],
  viewport: { width: number; height: number },
): { x: number; y: number } {
  return clampToRect(
    x,
    y,
    {
      width: estimateContextMenuWidth(labels, viewport.width),
      height: estimateContextMenuHeight(labels.length),
    },
    viewport,
  );
}
