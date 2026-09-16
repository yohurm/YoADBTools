/**
 * 列表换位（L2）。几何与数组代数；不碰 DOM / 不组装 aria。
 * 定高走 itemHeight；变高走行盒（内容坐标）。禁止常驻手柄。
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

/** 变高列表行盒。top / height 是滚动内容坐标，不是视口。 */
export interface ReorderRowBox {
  top: number;
  height: number;
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

/** 拖动预览：夹在 from→to 之间的邻行让出空位（+1 下移 / -1 上移）。源行恒 0。 */
export function shiftForReorder(index: number, from: number, to: number): number {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -1;
  if (from > to && index >= to && index < from) return 1;
  return 0;
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

/** 指针内容坐标落到最近行缝（0..count）。上半插入该行之前，下半之后。 */
export function insertIndexFromRowBoxes(boxes: readonly ReorderRowBox[], y: number): number {
  if (boxes.length === 0) return 0;
  for (let i = 0; i < boxes.length; i++) {
    const row = boxes[i]!;
    if (y < row.top + row.height / 2) return i;
  }
  return boxes.length;
}

/** 插入条钉在变高缝上（内容坐标）。 */
export function reorderBarOffsetFromBoxes(boxes: readonly ReorderRowBox[], insert: number): number {
  if (insert <= 0 || boxes.length === 0) return 0;
  const prev = boxes[Math.min(insert, boxes.length) - 1]!;
  return prev.top + prev.height;
}

/** 变高让位：夹在 from→to 之间的行按源行高平移。被拖行不走此位移。 */
export function shiftPxForReorder(index: number, from: number, to: number, sourceHeight: number): number {
  return shiftForReorder(index, from, to) * sourceHeight;
}

export function pointerContentY(listTop: number, scrollTop: number, clientY: number): number {
  return clientY - listTop + scrollTop;
}

export function reorderRowKey<T>(
  item: T,
  index: number,
  getKey?: (item: T, index: number) => string | number,
): string | number {
  return getKey ? getKey(item, index) : index;
}
