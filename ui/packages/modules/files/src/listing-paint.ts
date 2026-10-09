/**
 * 清单绘制相位。对照 ddmlib FileListingService / VS Code Explorer：
 * 有快照就画行；加载不是空数据；全屏 loading 只用于冷启动。
 */

export type ListingPaint = "rows" | "empty" | "cold" | "pending" | "fault";

/** 有快照就画行。 */
export function listingPaintIsRows(paint: ListingPaint): boolean {
  return paint === "rows";
}

/** 冷启动全屏加载。 */
export function listingPaintIsCold(paint: ListingPaint): boolean {
  return paint === "cold";
}

/** 无行且不在飞、也没有失败。pending 是其余在飞分支，不画表也不画空态。 */
export function listingPaintIsEmpty(paint: ListingPaint): boolean {
  return paint === "empty";
}

/** 列表失败且没有可画的快照。成功的零行不是这一相。 */
export function listingPaintIsFault(paint: ListingPaint): boolean {
  return paint === "fault";
}

export function listingPaint(
  entryCount: number,
  loading: boolean,
  cold: boolean,
  fault: boolean,
): ListingPaint {
  if (entryCount > 0) return "rows";
  if (loading) return cold ? "cold" : "pending";
  if (fault) return "fault";
  return "empty";
}

export function listingCacheKey(serial: string, path: string): string {
  return `${serial}\0${path}`;
}
