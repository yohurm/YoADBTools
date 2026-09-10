/**
 * 定高虚拟列表模型（L2）。
 * 窗口、选择投影与键盘目标下标是不变式；不碰 DOM / 不组装 aria。
 */

import { adjacentJoin, type SelectJoin } from "../keymap/selection";

export const VIRTUAL_STICK_THRESHOLD = 32;
export const VIRTUAL_DEFAULT_ITEM_HEIGHT = 22;
export const VIRTUAL_DEFAULT_OVERSCAN = 10;
export const VIRTUAL_DEFAULT_TONE = "document";
export const VIRTUAL_FOCUS_RETRY_LIMIT = 3;

export type VirtualKeyIntent = { type: "move"; index: number } | { type: "commit" };

export interface VirtualVisibleRow<T> {
  index: number;
  item: T;
  key: string | number;
}

export interface VirtualIndicatorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function virtualTotalHeight(count: number, itemHeight: number): number {
  return count * itemHeight;
}

export function virtualRange(
  scrollTop: number,
  viewportHeight: number,
  itemHeight: number,
  count: number,
  overscan: number,
): { start: number; end: number } {
  if (itemHeight <= 0 || count <= 0) return { start: 0, end: 0 };
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleEnd = Math.ceil((scrollTop + viewportHeight) / itemHeight);
  const end = Math.min(count, visibleEnd + overscan);
  return { start, end };
}

export function isStuckToBottom(
  scrollHeight: number,
  clientHeight: number,
  scrollTop: number,
  threshold = VIRTUAL_STICK_THRESHOLD,
): boolean {
  return scrollHeight - clientHeight - scrollTop <= threshold;
}

export function virtualRowKey<T>(
  item: T,
  index: number,
  getItemKey?: (item: T, index: number) => string | number,
): string | number {
  return getItemKey ? getItemKey(item, index) : index;
}

export function virtualVisibleRows<T>(
  items: readonly T[],
  start: number,
  end: number,
  getItemKey?: (item: T, index: number) => string | number,
): VirtualVisibleRow<T>[] {
  const rows: VirtualVisibleRow<T>[] = [];
  for (let i = start; i < end; i++) {
    const item = items[i];
    if (item === undefined) break;
    rows.push({ index: i, item, key: virtualRowKey(item, i, getItemKey) });
  }
  return rows;
}

/** For 用的稳定 key。包装对象每次新建，不能当 For 身份。 */
export function virtualVisibleKeys<T>(rows: readonly VirtualVisibleRow<T>[]): Array<string | number> {
  return rows.map((row) => row.key);
}

export function isVirtualSelectable(
  hasSelectedKey: boolean,
  hasSelectedKeys: boolean,
  hasOnSelectRow: boolean,
): boolean {
  return (hasSelectedKey || hasSelectedKeys) && hasOnSelectRow;
}

export function isVirtualMulti(hasSelectedKeys: boolean): boolean {
  return hasSelectedKeys;
}

export function isVirtualRowSelected(
  key: string | number,
  selectable: boolean,
  selectedKeys?: ReadonlySet<string | number>,
  selectedKey?: string | number | null,
): boolean {
  if (!selectable) return false;
  if (selectedKeys !== undefined) return selectedKeys.has(key);
  return selectedKey === key;
}

export function isVirtualSelectionEmpty(
  selectedKeys?: ReadonlySet<string | number>,
  selectedKey?: string | number | null,
): boolean {
  if (selectedKeys !== undefined) return selectedKeys.size === 0;
  return selectedKey === null || selectedKey === undefined;
}

export function virtualNeighborSelected<T>(
  items: readonly T[],
  index: number,
  selectable: boolean,
  selectedKeys?: ReadonlySet<string | number>,
  selectedKey?: string | number | null,
  getItemKey?: (item: T, index: number) => string | number,
): boolean {
  const item = items[index];
  if (item === undefined) return false;
  return isVirtualRowSelected(
    virtualRowKey(item, index, getItemKey),
    selectable,
    selectedKeys,
    selectedKey,
  );
}

export function virtualAdjacentSelected<T>(
  items: readonly T[],
  index: number,
  selectable: boolean,
  selectedKeys?: ReadonlySet<string | number>,
  selectedKey?: string | number | null,
  getItemKey?: (item: T, index: number) => string | number,
): { prev: boolean; next: boolean } {
  return {
    prev: virtualNeighborSelected(items, index - 1, selectable, selectedKeys, selectedKey, getItemKey),
    next: virtualNeighborSelected(items, index + 1, selectable, selectedKeys, selectedKey, getItemKey),
  };
}

export function virtualRowJoin(
  selected: boolean,
  prevSelected: boolean,
  nextSelected: boolean,
): SelectJoin | null {
  return adjacentJoin(selected, prevSelected, nextSelected);
}

/** 选中=0；空选时首可视行=0；否则 -1；不可选=undefined。 */
export function virtualRowTabIndex(input: {
  selectable: boolean;
  selected: boolean;
  selectionEmpty: boolean;
  isFirstVisible: boolean;
}): number | undefined {
  if (!input.selectable) return undefined;
  if (input.selected) return 0;
  if (input.selectionEmpty && input.isFirstVisible) return 0;
  return -1;
}

/** 多选仅 1 个 key 才 follow；0 或 ≥2 为 undefined。 */
export function virtualIndicatorFollow(
  selectable: boolean,
  selectedKeys?: ReadonlySet<string | number>,
  selectedKey?: string | number | null,
): string | undefined {
  if (!selectable) return undefined;
  if (selectedKeys !== undefined) {
    const keys = [...selectedKeys];
    return keys.length === 1 ? String(keys[0]) : undefined;
  }
  return selectedKey == null ? undefined : String(selectedKey);
}

export function virtualRowTop(index: number, itemHeight: number): number {
  return index * itemHeight;
}

export function virtualIndicatorBox(
  index: number,
  itemHeight: number,
  clientWidth: number,
): VirtualIndicatorBox {
  return {
    x: 0,
    y: virtualRowTop(index, itemHeight),
    width: clientWidth,
    height: itemHeight,
  };
}

export function virtualIndexOfKey<T>(
  items: readonly T[],
  key: string | number,
  getItemKey?: (item: T, index: number) => string | number,
): number {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === undefined) break;
    if (virtualRowKey(item, i, getItemKey) === key) return i;
  }
  return -1;
}

export function virtualIndicatorAnchor<T>(
  items: readonly T[],
  follow: string | undefined,
  itemHeight: number,
  clientWidth: number,
  getItemKey?: (item: T, index: number) => string | number,
): VirtualIndicatorBox | null {
  if (follow == null) return null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === undefined) break;
    if (String(virtualRowKey(item, i, getItemKey)) === follow) {
      return virtualIndicatorBox(i, itemHeight, clientWidth);
    }
  }
  return null;
}

/** Arrow/Home/End 夹紧到 [0, count)；Enter/Space 是 commit 当前。未识别或空表为 null。 */
export function virtualKeyIntent(key: string, index: number, count: number): VirtualKeyIntent | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown":
      return { type: "move", index: Math.min(count - 1, index + 1) };
    case "ArrowUp":
      return { type: "move", index: Math.max(0, index - 1) };
    case "Home":
      return { type: "move", index: 0 };
    case "End":
      return { type: "move", index: count - 1 };
    case "Enter":
    case " ":
      return { type: "commit" };
    default:
      return null;
  }
}
