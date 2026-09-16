/**
 * 指向型气泡定位（L3）。
 * 菜单走 popover-place（锁触发钮宽、可纵滚）。本文件只服务 hug 内容的 Tips：
 * 高用气泡自身、贴边 6vp、箭头对准锚点中心。禁止再调 placePopover。
 */

import { overlayLayerStyle, type PopoverPlacement } from "./popover-place";
import { readViewport } from "../placement/viewport";
import { Layout } from "../tokens/layout";
import type { TooltipTriggerBox } from "./tooltip-policy";

export function readTooltipTrigger(el: Element | undefined): TooltipTriggerBox {
  const rect = el?.getBoundingClientRect();
  if (!rect) return { top: 0, left: 0, bottom: 0, width: 0, height: 0 };
  return { top: rect.top, left: rect.left, bottom: rect.bottom, width: rect.width, height: rect.height };
}

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

/** 气泡 hug 自身；箭头跟锚点中心，贴边后仍指向。 */
export function placeTooltip(
  trigger: TooltipTriggerBox,
  bubble: { width: number; height: number },
  viewport: { width: number; height: number } = readViewport(),
): PlaceTooltipResult {
  const edge = Layout.TooltipEdge;
  const arrowOut = Layout.TooltipArrow / 2;
  const gap = Layout.TooltipGap;
  const inset = Layout.TooltipArrowInset;
  const width = Math.max(0, bubble.width);
  const height = Math.max(0, bubble.height);
  const needed = height + arrowOut + gap;
  const spaceAbove = Math.max(0, trigger.top - edge);
  const spaceBelow = Math.max(0, viewport.height - trigger.bottom - edge);

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
    placement === "bottom"
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
  layer.dataset.placed = "true";
  layer.removeAttribute("data-overflow-y");
}
