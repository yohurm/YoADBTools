/**
 * 定高虚拟列表模型（L2）。
 * 槽位池、选择投影与键盘目标下标是不变式；不碰 DOM / 不组装 aria。
 */

import { Spacing } from "../tokens/spacing";

export const VIRTUAL_STICK_THRESHOLD = Spacing.TwoXl;
export const VIRTUAL_DEFAULT_ITEM_HEIGHT = 22;
export const VIRTUAL_DEFAULT_OVERSCAN = 10;
export const VIRTUAL_DEFAULT_TONE = "document";
export const VIRTUAL_FOCUS_RETRY_LIMIT = 3;

export type VirtualKeyIntent = { type: "move"; index: number } | { type: "commit" };

export interface VirtualIndicatorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function virtualTotalHeight(count: number, itemHeight: number): number {
  return count * itemHeight;
}

/**
 * 稳定槽位数：可视行 + 1 行碎行 + 两侧 overscan，且不超过 count。
 * 滚动时大小不变，For 才按槽位身份回收行节点。
 */
export function virtualPoolSize(
  viewportHeight: number,
  itemHeight: number,
  overscan: number,
  count: number,
): number {
  if (itemHeight <= 0 || count <= 0) return 0;
  const visible = Math.max(1, Math.ceil(Math.max(0, viewportHeight) / itemHeight) + 1);
  return Math.min(count, visible + Math.max(0, overscan) * 2);
}

/** 池原点：第一条槽对应的数据下标。夹在 [0, count - poolSize]。 */
export function virtualPoolOrigin(
  scrollTop: number,
  itemHeight: number,
  overscan: number,
  count: number,
  poolSize: number,
): number {
  if (itemHeight <= 0 || poolSize <= 0) return 0;
  const raw = Math.floor(Math.max(0, scrollTop) / itemHeight) - Math.max(0, overscan);
  const maxOrigin = Math.max(0, count - poolSize);
  return Math.min(maxOrigin, Math.max(0, raw));
}

export function virtualPoolIndex(origin: number, slot: number): number {
  return origin + slot;
}

/** For 用的稳定槽位身份 0..n-1。n 不变则调用方应复用同一数组。 */
export function virtualPoolSlots(size: number): number[] {
  if (size <= 0) return [];
  const slots = new Array<number>(size);
  for (let i = 0; i < size; i++) slots[i] = i;
  return slots;
}

export function isStuckToBottom(
  contentExtent: number,
  clientHeight: number,
  scrollTop: number,
  threshold = VIRTUAL_STICK_THRESHOLD,
): boolean {
  return contentExtent - clientHeight - scrollTop <= threshold;
}

export function virtualRowKey<T>(
  item: T,
  index: number,
  getItemKey?: (item: T, index: number) => string | number,
): string | number {
  return getItemKey ? getItemKey(item, index) : index;
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

/** 多选只保留一个 tab 停：焦点锚在集内则用它，否则取集内第一项。空选为 null。 */
export function virtualActiveKey(
  selectedKeys?: ReadonlySet<string | number>,
  selectedKey?: string | number | null,
  focusKey?: string | number | null,
): string | number | null {
  if (selectedKeys !== undefined) {
    if (selectedKeys.size === 0) return null;
    if (focusKey != null && selectedKeys.has(focusKey)) return focusKey;
    for (const key of selectedKeys) return key;
    return null;
  }
  return selectedKey ?? null;
}

/** 活动行=0；空选时首可视行=0；否则 -1；不可选=undefined。禁止凡选中都 0（槽位回收会把焦点钉在槽上）。 */
export function virtualRowTabIndex(input: {
  selectable: boolean;
  active: boolean;
  selectionEmpty: boolean;
  isFirstVisible: boolean;
}): number | undefined {
  if (!input.selectable) return undefined;
  if (input.active) return 0;
  if (input.selectionEmpty && input.isFirstVisible) return 0;
  return -1;
}

/** 多选仅 1 个 key 才 follow；0 或 ≥2 为 undefined。是否挂滑块由调用方按行物种决定。 */
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

/**
 * block:nearest 的目标 scrollTop。
 * 行已全可见则保持；上沿在视口之上则钉行顶；下沿在视口之下则钉行底。
 * 不夹内容高度——可滚距离由 YoScroller.scrollTo 收口。
 */
export function virtualNearestScrollTop(
  rowTop: number,
  itemHeight: number,
  view: number,
  scrollTop: number,
): number {
  const start = Math.max(0, scrollTop);
  if (!(itemHeight > 0) || !(view > 0)) return start;
  const top = Math.max(0, rowTop);
  if (top < start) return top;
  if (top + itemHeight > start + view) return Math.max(0, top + itemHeight - view);
  return start;
}

/** 内容坐标 Y：行位 + 换位让位（行数）。L4 用同一条 translate3d，禁止 top 与第二段 transform 叠跳。 */
export function virtualRowOffsetY(index: number, itemHeight: number, shiftRows = 0): number {
  return (index + shiftRows) * itemHeight;
}

export function virtualRowTransform(index: number, itemHeight: number, shiftRows = 0): string {
  return `translate3d(0, ${virtualRowOffsetY(index, itemHeight, shiftRows)}px, 0)`;
}

/** 槽位几何。必须走 inline：壳最后载入 states.css，`.yohu-interactive { position: relative }` 会盖掉等特异的 CSS absolute。 */
export function virtualRowBoxStyle(
  index: number,
  itemHeight: number,
  shiftRows = 0,
  visible = true,
): {
  position: "absolute";
  top: "0px";
  left: "0px";
  right: "0px";
  height: string;
  transform: string;
  visibility?: "hidden";
} {
  return {
    position: "absolute",
    top: "0px",
    left: "0px",
    right: "0px",
    height: `${itemHeight}px`,
    transform: virtualRowTransform(index, itemHeight, shiftRows),
    ...(visible ? {} : { visibility: "hidden" as const }),
  };
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
