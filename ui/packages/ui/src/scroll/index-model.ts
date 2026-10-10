/** 行号滚轴。滑块是可见行 / 总命中行，位置是行号。 */

export function indexThumbSpan(viewport: number, total: number): number {
  if (total <= 0) return 1;
  const span = viewport / total;
  if (span >= 1) return 1;
  if (span <= 0) return 0;
  return span;
}

/** 指针在轨道上的位置换成命中行号。 */
export function indexFromPointer(pointer: number, track: number, total: number, viewport: number): number {
  if (track <= 0 || total <= viewport) return 0;
  const span = indexThumbSpan(viewport, total);
  const travel = track * (1 - span);
  const ratio = travel <= 0 ? 0 : Math.min(1, Math.max(0, pointer / travel));
  const maxIndex = total - viewport;
  return Math.round(ratio * maxIndex);
}

/** 滚轮像素换成行数。不足一行时按方向走一行。 */
export function indexWheelStep(deltaY: number, rowPx: number): number {
  if (rowPx <= 0 || deltaY === 0) return 0;
  const rows = Math.trunc(deltaY / rowPx);
  if (rows !== 0) return rows;
  return Math.sign(deltaY);
}

export function indexAtTail(at: number, viewport: number, total: number): boolean {
  if (total <= 0) return true;
  return at + viewport >= total;
}

/** 离页边还剩这么多行就预取下一页，拖动不必等出页才动。 */
export const INDEX_PAGE_MARGIN = 8;

/** 钉底时的轨道偏移。视口盖住全文末行，滑块贴在末端。 */
export function indexTailOffset(extent: number, viewport: number): number {
  if (extent <= viewport) return 0;
  return extent - viewport;
}

/** 轨道偏移换成视口顶行。 */
export function indexFromOffset(offset: number, rowPx: number): number {
  if (rowPx <= 0) return 0;
  return Math.max(0, Math.round(offset / rowPx));
}

/** 视口里能排下的行数。 */
export function indexViewRows(viewport: number, rowPx: number): number {
  if (rowPx <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, viewport) / rowPx));
}

/**
 * 当前页是否盖住视口，并且离页边还有余量。
 * 文档顶没有更早的行、文档底没有更晚的行时，不再为了凑余量重复要页。
 */
export function indexPageHolds(
  at: number,
  pageRows: number,
  first: number,
  viewRows: number,
  total: number,
  margin = INDEX_PAGE_MARGIN,
): boolean {
  if (pageRows <= 0 || viewRows <= 0) return false;
  const viewEnd = first + viewRows;
  const pageEnd = at + pageRows;
  if (first < at || viewEnd > pageEnd) return false;
  if (at > 0 && first - at < margin) return false;
  if (pageEnd < total && pageEnd - viewEnd < margin) return false;
  return true;
}

/** 要页时把视口放在页的中部，上下拖都还有本地行。 */
export function indexFetchAt(first: number, pageRows: number, viewRows: number): number {
  const room = Math.max(0, pageRows - Math.max(1, viewRows));
  return Math.max(0, first - Math.floor(room / 2));
}

/**
 * 全文偏移落到当前页里的平移。
 * `at` 是这一页第一行的命中序号。超出本页的偏移夹在页内，等下一页换上。
 */
export function indexPageShift(
  offset: number,
  at: number,
  pageRows: number,
  rowPx: number,
  viewport: number,
): number {
  if (rowPx <= 0 || pageRows <= 0) return 0;
  const pageTop = at * rowPx;
  const pageHeight = pageRows * rowPx;
  const maxShift = Math.max(0, pageHeight - Math.max(0, viewport));
  const raw = offset - pageTop;
  if (raw <= 0) return 0;
  if (raw >= maxShift) return maxShift;
  return raw;
}
