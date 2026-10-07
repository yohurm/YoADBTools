/**
 * 下拉菜单落点（L3）。prefer=bottom、align=start、min=触发钮宽。
 * 只调 popover-place 算盒并返回 placement / overflowY / style。不写 DOM。
 */

import { Spacing } from "../tokens/spacing";
import { controlRowHeight } from "../tokens";
import type { AnchorBox } from "../placement/anchor";
import {
  estimateMenuHeight,
  placePopover,
  popoverLayerStyle,
  readViewport,
} from "../overlay/popover-place";
import type { SelectMenuLayout, SelectMenuMeasure } from "./select-model";

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
    estimateMenuHeight(measure.optionCount, selectRowHeight(trigger), Spacing.Xs * 2),
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
    maxHeightCap: Spacing.Xl * 10,
  });
  return {
    placement: box.placement,
    overflowY: box.overflowY,
    style: popoverLayerStyle(box),
  };
}
