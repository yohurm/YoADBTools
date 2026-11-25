/** 单窗口视口窗口上限（ADR-v6-050）：UI 只持视口窗口 + 前后缓冲，不再持全量文档。 */
export const WINDOW_MAX = 2000;

/** 单窗口实际窗口上限：不超过全局视口上限，也不超过设备环容量。 */
export function docCap(bufferCapacity: number): number {
  return Math.max(1, Math.min(WINDOW_MAX, bufferCapacity));
}
