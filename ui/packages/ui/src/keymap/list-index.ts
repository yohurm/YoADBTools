/**
 * 列表下标。
 * 夹紧与首尾不回绕：树、虚拟清单、换位键盘停在两端。
 * 循环步进是 stepWrappedIndex。下拉、菜单和分段都走它；缺项时从哪一格起算仍由调用方决定。
 */

import { spaceKey } from "./chord";

export type ListEdge = "start" | "end";

/** 空表为 -1。其余收到 [0, count)。 */
export function clampListIndex(index: number, count: number): number {
  if (count <= 0) return -1;
  return Math.min(Math.max(index, 0), count - 1);
}

export function listEdgeIsStart(edge: ListEdge): boolean {
  return edge === "start";
}

/** 纵向列表键。下是 +1，上是 -1。 */
export function verticalListDelta(key: string): 1 | -1 | null {
  if (key === "ArrowDown") return 1;
  if (key === "ArrowUp") return -1;
  return null;
}

/** 横向列表键。右是 +1，左是 -1。 */
export function horizontalListDelta(key: string): 1 | -1 | null {
  if (key === "ArrowRight") return 1;
  if (key === "ArrowLeft") return -1;
  return null;
}

/** Home 是首端，End 是末端。 */
export function listEdgeKey(key: string): ListEdge | null {
  if (key === "Home") return "start";
  if (key === "End") return "end";
  return null;
}

/** Enter。字段提交认这一把。列表确认另加空格。 */
export function enterKey(key: string): boolean {
  return key === "Enter";
}

/** Enter 与 Space 确认当前项。 */
export function listActivateKey(key: string): boolean {
  return enterKey(key) || spaceKey(key);
}

/** Escape 取消当前手势。 */
export function dismissKey(key: string): boolean {
  return key === "Escape";
}

/** Tab 键。焦点陷阱、下拉提交、菜单关闭都认这一把。 */
export function tabKey(key: string): boolean {
  return key === "Tab";
}

/** 空表为 -1。start 是 0，end 是末项。 */
export function listEdgeIndex(count: number, edge: ListEdge): number {
  if (count <= 0) return -1;
  return listEdgeIsStart(edge) ? 0 : count - 1;
}

/** 这一项后面还有下一项。空表、负下标和末项都没有。 */
export function listIndexHasSuccessor(index: number, count: number): boolean {
  if (count <= 0 || index < 0) return false;
  return index < count - 1;
}

/** 空长为 -1。其余在 [0, count) 内循环。 */
export function stepWrappedIndex(count: number, from: number, delta: number): number {
  if (count <= 0) return -1;
  return (from + delta + count) % count;
}

/** 没有这一项，或 disabled 为真，则不可选。缺省 disabled 算可选。 */
export function itemIsEnabled<T extends { disabled?: boolean }>(item: T | undefined): item is T {
  return item !== undefined && item.disabled !== true;
}

/** 没禁用的下标。菜单和分段共用。 */
export function enabledIndexes(items: readonly { disabled?: boolean }[]): number[] {
  const indexes: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (itemIsEnabled(items[i])) indexes.push(i);
  }
  return indexes;
}
