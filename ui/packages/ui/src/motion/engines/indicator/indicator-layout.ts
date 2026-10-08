/**
 * 选中指示器几何：目标盒相对 track 内容坐标（含滚动）。
 * 位移走弹簧；宽高走软弹簧滞后（拉伸回弹）。
 */
import type { MotionDurationName } from "../../../tokens/motion";
import { Spacing } from "../../../tokens/spacing";

export type IndicatorVariant = "fill" | "underline" | "thumb";

/** 底边滑块只走横向位移。fill / thumb 画盒，是其余分支。 */
export function indicatorVariantIsUnderline(variant: IndicatorVariant): boolean {
  return variant === "underline";
}

/** 实底。测完后才把 data-indicator-ready 写在轨上。underline / thumb 不写。 */
export function indicatorVariantIsFill(variant: IndicatorVariant): boolean {
  return variant === "fill";
}

export interface IndicatorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const EMPTY_INDICATOR: IndicatorBox = { x: 0, y: 0, width: 0, height: 0 };

function indicatorExtent(value: number): number {
  return Math.max(0, value);
}

function indicatorAxis(itemEdge: number, trackEdge: number, scroll: number): number {
  return itemEdge - trackEdge + scroll;
}

export function measureIndicator(
  track: DOMRectReadOnly,
  item: DOMRectReadOnly,
  scroll: { left: number; top: number } = { left: 0, top: 0 },
): IndicatorBox {
  return {
    x: indicatorAxis(item.left, track.left, scroll.left),
    y: indicatorAxis(item.top, track.top, scroll.top),
    width: indicatorExtent(item.width),
    height: indicatorExtent(item.height),
  };
}

function indicatorOpen(value: number): boolean {
  return value > 0;
}

export function indicatorReady(box: IndicatorBox): boolean {
  return indicatorOpen(box.width) && indicatorOpen(box.height);
}

function indicatorDelta(to: number, from: number): number {
  return to - from;
}

/** 行程定时长：短跳 fast、邻项 small、跨栏 local。 */
export function indicatorDurationName(from: IndicatorBox, to: IndicatorBox): MotionDurationName {
  const dist = Math.hypot(indicatorDelta(to.x, from.x), indicatorDelta(to.y, from.y));
  if (dist < Spacing.TwoXl) {
    return "fast";
  }
  if (dist < Spacing.TwoXl * 4) {
    return "small";
  }
  return "local";
}
