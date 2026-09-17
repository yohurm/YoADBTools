/**
 * 内容用后高行程（L2）。
 * 插值的是槽内子盒 already-used px（宿主 height），不是 auto / 宿主解锁高。
 * 0 / 未布局 / 噪声位移不构成行程。不碰 DOM。
 */

export const DEFAULT_GROW_DELTA = 1;

export const GROW_TRIP_PROPERTY = "height";

export interface Grow {
  from: number;
  to: number;
}

/** 首帧、零盒、小于阈值的抖动都不开行程。 */
export function resolveGrow(from: number, to: number): Grow | undefined {
  if (!(from > 0) || !(to > 0)) return undefined;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined;
  if (Math.abs(to - from) < DEFAULT_GROW_DELTA) return undefined;
  return { from, to };
}
