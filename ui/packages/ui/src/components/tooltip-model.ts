/**
 * 气泡提示领域模型（L2）。
 * 内容与延迟规格名；不碰 DOM、不开合。
 */

import type { MotionSpecName } from "../tokens/motion";

/** 缺省出示延迟：浮层淡入规格（`--yohu-dur-normal`）。 */
export const DEFAULT_TOOLTIP_DELAY: MotionSpecName = "effectsEnter";

export const DEFAULT_TOOLTIP_HIDE_DELAY: MotionSpecName = "effectsFast";

export interface TooltipTip {
  id: string;
  content: string;
}

export function tooltipIsEmpty(content: unknown): boolean {
  if (content === null || content === undefined) return true;
  if (typeof content === "string") return content.trim().length === 0;
  return false;
}

export function tooltipDomId(id: string): string {
  return `yohu-tooltip-${id}`;
}

let nextTipId = 1;

export function allocTooltipId(): string {
  return `t${nextTipId++}`;
}
