/**
 * 气泡定位（L3）。prefer=top、align=center、hug 内容；算法只调 popover-place。
 * 不写第二套公式，不写色值。
 */

import { Spacing } from "../tokens/spacing";
import { placePopover, readViewport, type PlacePopoverResult } from "./popover-place";
import type { TooltipTriggerBox } from "./tooltip-policy";

export function readTooltipTrigger(el: Element | undefined): TooltipTriggerBox {
  const rect = el?.getBoundingClientRect();
  if (!rect) return { top: 0, left: 0, bottom: 0, width: 0, height: 0 };
  return { top: rect.top, left: rect.left, bottom: rect.bottom, width: rect.width, height: rect.height };
}

/** 气泡 hug 自身：minWidth=内容宽，不锁成锚点宽。 */
export function placeTooltip(
  trigger: TooltipTriggerBox,
  bubble: { width: number; height: number },
  viewport: { width: number; height: number } = readViewport(),
): PlacePopoverResult {
  return placePopover({
    trigger: {
      top: trigger.top,
      left: trigger.left,
      bottom: trigger.bottom,
      width: trigger.width,
    },
    menuHeight: Math.max(bubble.height, trigger.height, 1),
    viewport,
    gap: Spacing.Xs,
    maxHeightCap: Spacing.Xl * 8,
    prefer: "top",
    minWidth: Math.max(bubble.width, 0),
    align: "center",
  });
}
