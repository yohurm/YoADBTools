/** 窗口文档上限。与环的 `buffer_capacity` 同一条数，滚动只在这份文档里取可见行。 */
export function docCap(bufferCapacity: number): number {
  return Math.max(1, bufferCapacity);
}
