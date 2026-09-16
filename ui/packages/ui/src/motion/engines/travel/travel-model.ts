/**
 * 尺寸行程（L2）。
 * 插值的是已在树上的用后 px，不是 auto / 固有高。
 * 0 / 未布局 / 噪声位移不构成行程。不碰 DOM，不点控件选择器。
 */

export const DEFAULT_TRAVEL_DELTA = 1;

export type TravelAxis = "block" | "inline";

export const TRAVEL_AXES: readonly TravelAxis[] = ["block", "inline"];

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
export function normalizeTravelAxes(axes?: readonly TravelAxis[]): TravelAxis[] {
  const requested = axes && axes.length > 0 ? axes : (["block"] as const);
  return TRAVEL_AXES.filter((axis) => requested.includes(axis));
}

/** 首帧、零盒、小于阈值的抖动都不开行程。 */
export function resolveTravel(input: TravelInput): Travel | undefined {
  const from = input.from;
  const to = input.to;
  const minDelta = input.minDelta ?? DEFAULT_TRAVEL_DELTA;
  if (!(from > 0) || !(to > 0)) return undefined;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined;
  if (Math.abs(to - from) < minDelta) return undefined;
  return { from, to };
}

/** 按轴各自判定。两轴都不够行程则整次不算。 */
export function resolveTravelSize(input: {
  from: TravelSize;
  to: TravelSize;
  axes: readonly TravelAxis[];
  minDelta?: number;
}): { block?: Travel; inline?: Travel } | undefined {
  const block = input.axes.includes("block")
    ? resolveTravel({ from: input.from.block, to: input.to.block, minDelta: input.minDelta })
    : undefined;
  const inline = input.axes.includes("inline")
    ? resolveTravel({ from: input.from.inline, to: input.to.inline, minDelta: input.minDelta })
    : undefined;
  if (!block && !inline) return undefined;
  return { block, inline };
}
