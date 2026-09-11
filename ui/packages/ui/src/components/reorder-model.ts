/**
 * 定高列表换位（L2）。几何与数组代数；不碰 DOM / 不组装 aria。
 */

import { Spacing } from "../tokens/spacing";

/** 按下后位移达到此距离才进入拖动，避免误把点选当成换位。 */
export const REORDER_ARM_DISTANCE = Spacing.Sm;

export interface ReorderSession {
  from: number;
  /** 插入缝 0..count；home 为 from 或 from+1。 */
  insert: number;
  key: string | number;
}

/** 把一项挪到目标下标；越界或同位则原数组。 */
export function moveItemTo<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items as T[];
  }
  const copy = items.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

/**
 * 指针落到最近行缝（0..count）。对标 Apple / Atlassian closest-edge：
 * 上半插入该行之前，下半插入之后；可落到最后一行之后。
 */
export function insertIndexFromPointerY(
  listTop: number,
  scrollTop: number,
  itemHeight: number,
  count: number,
  y: number,
): number {
  if (count <= 0 || itemHeight <= 0) return 0;
  const rel = y - listTop + scrollTop;
  return Math.max(0, Math.min(count, Math.round(rel / itemHeight)));
}

/** 插入缝转 moveItemTo 下标；仍在原槽则 null。 */
export function moveIndexFromInsert(from: number, insert: number): number | null {
  if (insert === from || insert === from + 1) return null;
  return insert > from ? insert - 1 : insert;
}

/** 指针 Y 相对各行中线，得到应插入的目标下标。 */
export function dropIndexFromCenters(centers: readonly number[], y: number): number {
  if (centers.length === 0) return 0;
  let to = centers.length - 1;
  for (let i = 0; i < centers.length; i++) {
    if (y < centers[i]!) {
      to = i;
      break;
    }
  }
  return to;
}

/** 拖动预览：夹在 from→to 之间的行让出空位（+1 下移 / -1 上移）。被拖行不走此位移。 */
export function shiftForReorder(index: number, from: number, to: number): number {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -1;
  if (from > to && index >= to && index < from) return 1;
  return 0;
}

/** 含被拖行：源行跟到 dest，其余走 shiftForReorder。 */
export function rowReorderShift(index: number, from: number, dest: number): number {
  if (index === from) return dest - from;
  return shiftForReorder(index, from, dest);
}

export function isReorderArmed(
  startY: number,
  y: number,
  arm: number = REORDER_ARM_DISTANCE,
): boolean {
  return Math.abs(y - startY) >= arm;
}

/** 插入条钉在缝上（insert × 行高）。 */
export function reorderBarOffset(insert: number, itemHeight: number): number {
  return Math.max(0, insert) * itemHeight;
}

/** 浮层相对滚动容器顶：跟着指针，扣住按下时的抓取偏移。 */
export function overlayOffset(pointerY: number, listTop: number, grabOffset: number, itemHeight: number, viewportHeight: number): number {
  const raw = pointerY - listTop - grabOffset;
  return Math.max(0, Math.min(Math.max(0, viewportHeight - itemHeight), raw));
}

export function rowTopInViewport(
  listTop: number,
  scrollTop: number,
  index: number,
  itemHeight: number,
): number {
  return listTop + index * itemHeight - scrollTop;
}
