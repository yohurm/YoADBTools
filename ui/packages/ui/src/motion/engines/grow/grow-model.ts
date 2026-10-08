/**
 * 内容用后高行程（L2）。
 * 插值的是槽内子盒 already-used px（宿主 height），不是 auto / 宿主解锁高。
 * 是否成行程只问 resolveTravel。不碰 DOM。
 */

import { resolveTravel } from "../travel/travel-model";

export const DEFAULT_GROW_DELTA = 1;

export const GROW_TRIP_PROPERTY = "height";

export interface Grow {
  from: number;
  to: number;
}

/** 阈值是 DEFAULT_GROW_DELTA。是否成行程只问 resolveTravel。 */
export function resolveGrow(from: number, to: number): Grow | undefined {
  return resolveTravel({ from, to, minDelta: DEFAULT_GROW_DELTA });
}
