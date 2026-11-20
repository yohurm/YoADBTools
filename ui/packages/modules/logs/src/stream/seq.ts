/**
 * 日志文档的唯一 seq 对账原语（L2 纯函数）。
 *
 * 窗口文档的行按 `seq` 严格递增。凡「新批次相对旧批次」的定位都走这里，
 * 禁止在各文件各写一份 head-overlap（旧实现散落在 panel-projection / document / board 三处）。
 */

/** 按 seq 升序的数组里，第一个 `seqOf(item) >= target` 的下标。 */
export function lowerBoundSeq<T>(
  items: readonly T[],
  seqOf: (item: T) => number,
  target: number,
): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (seqOf(items[mid]!) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * 旧批次里「新批次首行」所在下标；新批次为空、或旧批次没有该 seq 时返回 -1。
 *
 * 返回下标即旧批次的头部淘汰数（`prev.length - 下标` 是两批重合的尾巴）。
 */
export function findHeadOverlap<T>(
  prev: readonly T[],
  next: readonly T[],
  seqOf: (item: T) => number,
): number {
  if (prev.length === 0 || next.length === 0) return -1;
  const first = seqOf(next[0]!);
  const idx = lowerBoundSeq(prev, seqOf, first);
  return idx < prev.length && seqOf(prev[idx]!) === first ? idx : -1;
}

/** 新批次是否旧批次的「真后缀追加」：共享同一首 seq，且旧批尾行 = 重合段末行。 */
export function isSuffixAppend<T>(
  prev: readonly T[],
  next: readonly T[],
  seqOf: (item: T) => number,
): { ok: true; evicted: number; tailStart: number } | { ok: false } {
  const evicted = findHeadOverlap(prev, next, seqOf);
  if (evicted < 0) return { ok: false };
  const keep = prev.length - evicted;
  if (keep > next.length) return { ok: false };
  if (keep > 0 && seqOf(prev[prev.length - 1]!) !== seqOf(next[keep - 1]!)) {
    return { ok: false };
  }
  return { ok: true, evicted, tailStart: keep };
}
