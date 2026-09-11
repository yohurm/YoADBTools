/**
 * 下拉菜单落点（L3）。prefer=bottom、align=start、min=触发钮宽。
 * 只调 popover-place，不写第二套公式，不写色值。
 */

import { Density } from "../tokens/density";
import { Spacing } from "../tokens/spacing";
import {
  applyPopoverBox,
  estimateMenuHeight,
  placePopover,
  popoverLayerStyle,
  readCssPx,
  readViewport,
} from "./popover-place";
import type { SelectMenuLayout, SelectMenuMeasure, SelectTriggerBox } from "./select-model";

export function readSelectTrigger(el: Element | undefined): SelectTriggerBox {
  const rect = el?.getBoundingClientRect();
  if (!rect) return { top: 0, left: 0, bottom: 0, width: 0, height: 0 };
  return { top: rect.top, left: rect.left, bottom: rect.bottom, width: rect.width, height: rect.height };
}

function selectRowHeight(trigger: SelectTriggerBox): number {
  return trigger.height || readCssPx("--yohu-control-height", Density.Comfortable.controlHeight);
}

export function layoutSelectMenu(
  trigger: SelectTriggerBox,
  measure: SelectMenuMeasure,
  layer: HTMLElement,
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
  applyPopoverBox(layer, box);
  return {
    placement: box.placement,
    overflowY: box.overflowY,
    style: popoverLayerStyle(box),
  };
}
