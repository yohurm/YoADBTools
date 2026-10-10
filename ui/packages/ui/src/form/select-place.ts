/**
 * 下拉菜单落点（L3）。
 * 宽至少等于触发钮，左对齐，间距 8vp。短钮按最长选项撑开，避免裁成省略号。
 * 内容超过菜单帽时才省略。视口更窄时收到视口宽。高 hug 内容，上限为视口高的 80%。不写 DOM。
 */

import { Layout } from "../tokens/layout";
import { Spacing } from "../tokens/spacing";
import { FontSizes } from "../tokens/typography";
import { controlRowHeight } from "../tokens";
import type { AnchorBox } from "../placement/anchor";
import {
  estimateMenuHeight,
  placePopover,
  popoverLayerStyle,
  readViewport,
} from "../overlay/popover-place";
import type { SelectMenuLayout, SelectMenuMeasure } from "./select-model";

/** Select.optionHeight 默认最大高度占屏幕可用高度的比例。 */
export const SELECT_MENU_VIEWPORT_RATIO = 0.8;

function textPx(text: string, em: number): number {
  return [...text].length * em;
}

/**
 * 一行内容宽：井两侧 + 字槽两侧 + 最长文案 + 与勾的间隙 + 勾槽。
 * 有次文案时再加一档间隙。与 `yohu-menu-well` / `yohu-menu-row` 同一档。
 */
export function selectMenuContentWidth(
  labels: readonly string[],
  descriptions: readonly string[] = [],
): number {
  let longest = 0;
  const count = Math.max(labels.length, descriptions.length);
  for (let index = 0; index < count; index += 1) {
    const label = textPx(labels[index] ?? "", FontSizes.Body);
    const description = textPx(descriptions[index] ?? "", FontSizes.Caption);
    const gaps = description > 0 ? Spacing.Sm * 2 : Spacing.Sm;
    longest = Math.max(longest, label + description + gaps);
  }
  return Spacing.Sm * 4 + Layout.IconInline + longest;
}

/**
 * 菜单宽 = max(触发钮, 内容)，内容帽 `Layout.MenuMax`。
 * 视口更窄时收到视口。触发钮更宽时仍与钮两侧对齐。
 */
export function selectMenuWidth(
  triggerWidth: number,
  contentWidth: number,
  viewportWidth: number,
): number {
  const trigger = Math.max(0, triggerWidth);
  const content = Math.min(Layout.MenuMax, Math.max(0, contentWidth));
  const fitted = Math.max(trigger, content);
  const view = Math.max(0, viewportWidth);
  if (view <= 0) return fitted;
  return Math.min(fitted, view);
}

function selectRowHeight(trigger: AnchorBox): number {
  return trigger.height || controlRowHeight();
}

export function layoutSelectMenu(
  trigger: AnchorBox,
  measure: SelectMenuMeasure,
  viewport: { width: number; height: number } = readViewport(),
): SelectMenuLayout {
  const menuHeight = Math.max(
    measure.scrollHeight,
    estimateMenuHeight(measure.optionCount, selectRowHeight(trigger), Spacing.Sm * 2),
  );
  const width = selectMenuWidth(
    trigger.width,
    selectMenuContentWidth(measure.labels ?? [], measure.descriptions ?? []),
    viewport.width,
  );
  const box = placePopover({
    trigger: {
      top: trigger.top,
      left: trigger.left,
      bottom: trigger.bottom,
      width: trigger.width,
    },
    menuHeight,
    viewport,
    gap: Spacing.Sm,
    minWidth: width,
    maxHeightCap: viewport.height * SELECT_MENU_VIEWPORT_RATIO,
  });
  return {
    placement: box.placement,
    overflowY: box.overflowY,
    style: { ...popoverLayerStyle(box), width: `${width}px` },
  };
}
