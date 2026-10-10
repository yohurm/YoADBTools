/** 与 `yohu_protocol::LOG_PAGE_LINES` 同一页宽。显式 `log.page` 仍用它。 */
export const LOG_VIEW_PAGE = 80;

/** 页不超过环容量，也不超过一屏加 overscan。 */
export function pageCap(bufferCapacity: number): number {
  const buffer = Math.max(1, bufferCapacity);
  return Math.min(buffer, LOG_VIEW_PAGE);
}

/** 窗口文档上限。与环的 `buffer_capacity` 同一条数，滚动只在这份文档里取可见行。 */
export function docCap(bufferCapacity: number): number {
  return Math.max(1, bufferCapacity);
}
