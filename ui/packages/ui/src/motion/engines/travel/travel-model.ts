/**
 * 尺寸行程（L2）。
 * 插值的是已在树上的用后 px，不是 auto / 固有高。
 * 0 / 未布局 / 噪声位移不构成行程。不碰 DOM，不点控件选择器。
 */

import { logicalAxesHaveBlock, logicalAxesHaveInline, type LogicalAxis } from "../../../placement/axis";

export const DEFAULT_TRAVEL_DELTA = 1;

export const TRAVEL_AXES: readonly LogicalAxis[] = ["block", "inline"];

export interface TravelInput {
  from: number;
  to: number;
  minDelta?: number;
}

export interface Travel {
  from: number;
  to: number;
}

export interface TravelSize {
  block: number;
  inline: number;
}

/** 缺省只走纵轴。去重后保持 block → inline。 */
export function normalizeTravelAxes(axes?: readonly LogicalAxis[]): LogicalAxis[] {
  const requested = axes && axes.length > 0 ? axes : (["block"] as const);
  return TRAVEL_AXES.filter((axis) => requested.includes(axis));
}

function travelOpen(value: number): boolean {
  return value > 0;
}

function travelFinite(value: number): boolean {
  return Number.isFinite(value);
}

/** 首帧、零盒、小于阈值的抖动都不开行程。 */
export function resolveTravel(input: TravelInput): Travel | undefined {
  const from = input.from;
  const to = input.to;
  const minDelta = input.minDelta ?? DEFAULT_TRAVEL_DELTA;
  if (!travelOpen(from) || !travelOpen(to)) return undefined;
  if (!travelFinite(from) || !travelFinite(to)) return undefined;
  if (Math.abs(to - from) < minDelta) return undefined;
  return { from, to };
}

/** 按轴各自判定。两轴都不够行程则整次不算。 */
export function resolveTravelSize(input: {
  from: TravelSize;
  to: TravelSize;
  axes: readonly LogicalAxis[];
  minDelta?: number;
}): { block?: Travel; inline?: Travel } | undefined {
  const block = logicalAxesHaveBlock(input.axes)
    ? resolveTravel({ from: input.from.block, to: input.to.block, minDelta: input.minDelta })
    : undefined;
  const inline = logicalAxesHaveInline(input.axes)
    ? resolveTravel({ from: input.from.inline, to: input.to.inline, minDelta: input.minDelta })
    : undefined;
  if (!block && !inline) return undefined;
  return { block, inline };
}
