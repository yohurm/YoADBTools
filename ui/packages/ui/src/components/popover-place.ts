/**
 * 浮层定位与叠层政策（L3）。
 * Select / Dialog / Tooltip 共用这一套：铬层只负责落点、夹紧、叠层 token。
 * 禁止第二套 Trigger，禁止组件私写 z-index 魔法数。
 *
 * 内容 hug 自身。禁止把 width 锁成触发钮宽——
 * 那会在 overflow-y:auto 下连带出横向滚动条（Windows 表现为「宽度调整条」）。
 */

import { readViewport } from "../placement/viewport";

export type PopoverPlacement = "bottom" | "top";

/** 浮层叠层角色。数值在 L0 `--yohu-z-*`；未入库前回退到现行档（见报告）。 */
export type OverlayKind = "dialog" | "popover";

export interface PlacePopoverInput {
  trigger: { top: number; left: number; bottom: number; width: number };
  /** 菜单内容高度（未裁切）；应 ≥ 选项估算，禁止传 0 当「下方永远放得下」 */
  menuHeight: number;
  viewport: { width: number; height: number };
  gap: number;
  maxHeightCap: number;
  /** 优先展开方向。Select 默认 bottom（hug 触发钮）；Tooltip 默认 top。 */
  prefer?: PopoverPlacement;
  /**
   * 最小宽。默认 = 触发钮宽（Select hug）。
   * Tooltip 传 0：内容 hug，不锁成锚点宽。
   */
  minWidth?: number;
  /** 水平对齐。默认 start（Select）；Tooltip 用 center。 */
  align?: "start" | "center";
}

export interface PlacePopoverResult {
  placement: PopoverPlacement;
  top: number | null;
  bottom: number | null;
  left: number;
  /** 不得窄于触发钮（对齐），但允许比它更宽 */
  minWidth: number;
  /** 从 left 起至视口右缘 */
  maxWidth: number;
  /** min(内容高, 可用高, cap)；内容更矮时 hug，不撑空白 */
  maxHeight: number;
  /** 仅内容高于可用空间时才允许纵向滚动 */
  overflowY: boolean;
}

export function readCssPx(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 视口读取单源（L1 共享能力），见 `../placement/viewport`。 */
export { readViewport };

export function estimateMenuHeight(optionCount: number, rowHeight: number, padY: number): number {
  return Math.max(0, optionCount) * rowHeight + padY;
}

/** 叠层只读 `--yohu-z-*`。禁止回退魔法数。 */
export function overlayLayerStyle(kind: OverlayKind): Record<string, string> {
  const token = kind === "dialog" ? "--yohu-z-dialog" : "--yohu-z-overlay";
  return { zIndex: `var(${token})` };
}

export function popoverLayerStyle(
  box: PlacePopoverResult,
  kind: OverlayKind = "popover",
): Record<string, string> {
  return {
    position: "fixed",
    top: box.top === null ? "auto" : `${box.top}px`,
    bottom: box.bottom === null ? "auto" : `${box.bottom}px`,
    left: `${box.left}px`,
    minWidth: `${box.minWidth}px`,
    maxWidth: `${box.maxWidth}px`,
    maxHeight: `${box.maxHeight}px`,
    ...overlayLayerStyle(kind),
  };
}

/** 写入定位层；显式清掉历史 width，避免热更新留下锁宽。 */
export function applyPopoverBox(
  layer: HTMLElement,
  box: PlacePopoverResult,
  kind: OverlayKind = "popover",
): void {
  const s = popoverLayerStyle(box, kind);
  layer.style.position = s.position!;
  layer.style.top = s.top!;
  layer.style.bottom = s.bottom!;
  layer.style.left = s.left!;
  layer.style.minWidth = s.minWidth!;
  layer.style.maxWidth = s.maxWidth!;
  layer.style.maxHeight = s.maxHeight!;
  layer.style.zIndex = s.zIndex!;
  layer.style.width = "";
  layer.dataset.placement = box.placement;
  layer.dataset.placed = "true";
  if (box.overflowY) layer.setAttribute("data-overflow-y", "");
  else layer.removeAttribute("data-overflow-y");
}

/** 按视口剩余空间决定上下展开；宽 hug 内容（默认 min=触发钮），高 hug 内容（仅超出才裁）。 */
export function placePopover(input: PlacePopoverInput): PlacePopoverResult {
  const { trigger, viewport, gap, maxHeightCap } = input;
  const prefer = input.prefer ?? "bottom";
  const desired = Math.max(0, input.menuHeight);
  const spaceBelow = Math.max(0, viewport.height - trigger.bottom - gap);
  const spaceAbove = Math.max(0, trigger.top - gap);

  let placement: PopoverPlacement;
  if (desired <= 0) {
    placement = spaceBelow === spaceAbove ? prefer : spaceBelow > spaceAbove ? "bottom" : "top";
  } else if (prefer === "top" && spaceAbove >= desired) {
    placement = "top";
  } else if (spaceBelow >= desired) {
    placement = "bottom";
  } else if (spaceAbove >= desired || spaceAbove > spaceBelow) {
    placement = "top";
  } else {
    placement = "bottom";
  }

  const available = placement === "bottom" ? spaceBelow : spaceAbove;
  const clipH = Math.max(0, Math.min(maxHeightCap, available));
  const maxHeight = desired > 0 ? Math.min(desired, clipH) : clipH;
  const overflowY = desired > clipH;

  const minWidth = Math.max(0, input.minWidth ?? trigger.width);
  const rawLeft =
    input.align === "center"
      ? trigger.left + trigger.width / 2 - minWidth / 2
      : trigger.left;
  const left = Math.min(Math.max(0, rawLeft), Math.max(0, viewport.width - minWidth));
  const maxWidth = Math.max(minWidth, viewport.width - left);

  if (placement === "bottom") {
    return {
      placement,
      top: trigger.bottom + gap,
      bottom: null,
      left,
      minWidth,
      maxWidth,
      maxHeight,
      overflowY,
    };
  }
  return {
    placement,
    top: null,
    bottom: Math.max(0, viewport.height - trigger.top + gap),
    left,
    minWidth,
    maxWidth,
    maxHeight,
    overflowY,
  };
}
