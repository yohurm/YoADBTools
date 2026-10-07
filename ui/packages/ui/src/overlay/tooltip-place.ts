/**
 * 指向型气泡定位（L3）。
 * 菜单走 popover-place（锁触发钮宽、可纵滚）。本文件只服务 hug 内容的 Tips：
 * 高用气泡自身、贴边 6vp、箭头对准锚点中心。禁止再调 placePopover。
 */

import { overlayLayerStyle, placementIsBottom, type PopoverPlacement } from "./popover-place";
import { presenceAttr } from "../dom/flag";
import type { AnchorBox } from "../placement/anchor";
import { readViewport } from "../placement/viewport";
import { Layout } from "../tokens/layout";

export interface PlaceTooltipResult {
  placement: PopoverPlacement;
  top: number;
  left: number;
  /** 箭头中心相对气泡左缘 */
  arrowLeft: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function tooltipExtent(value: number): number {
  return Math.max(0, value);
}

/** 气泡 hug 自身；箭头跟锚点中心，贴边后仍指向。 */
export function placeTooltip(
  trigger: AnchorBox,
  bubble: { width: number; height: number },
  viewport: { width: number; height: number } = readViewport(),
): PlaceTooltipResult {
  const edge = Layout.TooltipEdge;
  const arrowOut = Layout.TooltipArrow / 2;
  const gap = Layout.TooltipGap;
  const inset = Layout.TooltipArrowInset;
  const width = tooltipExtent(bubble.width);
  const height = tooltipExtent(bubble.height);
  const needed = height + arrowOut + gap;
  const spaceAbove = tooltipExtent(trigger.top - edge);
  const spaceBelow = tooltipExtent(viewport.height - trigger.bottom - edge);

  let placement: PopoverPlacement;
  if (spaceAbove >= needed) {
    placement = "top";
  } else if (spaceBelow >= needed || spaceBelow > spaceAbove) {
    placement = "bottom";
  } else {
    placement = "top";
  }

  const maxLeft = Math.max(edge, viewport.width - width - edge);
  const centered = trigger.left + trigger.width / 2 - width / 2;
  const left = clamp(centered, edge, maxLeft);
  const top =
    placementIsBottom(placement)
      ? trigger.bottom + gap + arrowOut
      : trigger.top - gap - arrowOut - height;

  const minInset = width <= 0 ? 0 : Math.min(inset, width / 2);
  const arrowLeft = clamp(trigger.left + trigger.width / 2 - left, minInset, Math.max(minInset, width - minInset));

  return { placement, top, left, arrowLeft };
}

export function tooltipLayerStyle(box: PlaceTooltipResult): Record<string, string> {
  return {
    position: "fixed",
    top: `${box.top}px`,
    left: `${box.left}px`,
    transition: "none",
    "--yohu-tooltip-arrow": `${box.arrowLeft}px`,
    ...overlayLayerStyle("popover"),
  };
}

/**
 * 写入指向层。落点是离散结果，调用方禁止再给 top/left 加 transition。
 * 清掉菜单定位留下的 minWidth / bottom / overflow。
 */
export function applyTooltipBox(layer: HTMLElement, box: PlaceTooltipResult): void {
  const s = tooltipLayerStyle(box);
  layer.style.position = s.position!;
  layer.style.transition = s.transition!;
  layer.style.top = s.top!;
  layer.style.left = s.left!;
  layer.style.bottom = "auto";
  layer.style.minWidth = "";
  layer.style.maxWidth = "";
  layer.style.maxHeight = "";
  layer.style.width = "";
  layer.style.zIndex = s.zIndex!;
  layer.style.setProperty("--yohu-tooltip-arrow", s["--yohu-tooltip-arrow"]!);
  layer.dataset.placement = box.placement;
  const placed = presenceAttr(true);
  if (placed !== undefined) layer.dataset.placed = placed;
  layer.removeAttribute("data-overflow-y");
}
