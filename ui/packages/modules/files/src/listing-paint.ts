/**
 * 清单绘制相位。对照 ddmlib FileListingService / VS Code Explorer：
 * 有快照就画行；加载不是空数据；全屏 loading 只用于冷启动。
 */

export type ListingPaint = "rows" | "empty" | "cold" | "pending";

export function listingPaint(
  entryCount: number,
  loading: boolean,
  cold: boolean,
): ListingPaint {
  if (entryCount > 0) return "rows";
  if (!loading) return "empty";
  return cold ? "cold" : "pending";
}

export function listingCacheKey(serial: string, path: string): string {
  return `${serial}\0${path}`;
}
