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
export type VirtualListLayout = "pool" | "flow";

/** Family A 文档划选：未开 listbox / 换位时行在文档流里，原生 Selection 才是一份文档。 */
export function virtualListLayout(input: {
  tone: "document" | "list";
  selectable: boolean;
  reordering: boolean;
}): VirtualListLayout {
  if (input.tone === "document" && !input.selectable && !input.reordering) {
    return "flow";
  }
  return "pool";
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

/**
 * 环形槽位：origin 步进只换一条进出的行。
 * slot 身份 0..poolSize-1 不变；窗口里 index ≡ slot (mod poolSize)。
 */
export function virtualPoolBindIndex(
  origin: number,
  slot: number,
  poolSize: number,
  count: number,
): number {
  if (poolSize <= 0 || slot < 0 || slot >= poolSize || count <= 0) return -1;
  const cycle = Math.floor(Math.max(0, origin) / poolSize) * poolSize;
  let index = slot + cycle;
  if (index < origin) index += poolSize;
  return index < count ? index : -1;
}

/** flow：可视下标按文档序。For 以数字为身份，origin 步进只卸一条、挂一条。 */
export function virtualFlowWindow(origin: number, poolSize: number, count: number): number[] {
  if (poolSize <= 0 || count <= 0) return [];
  const start = Math.max(0, origin);
  const end = Math.min(count, start + poolSize);
  if (end <= start) return [];
  const window = new Array<number>(end - start);
  for (let i = start; i < end; i++) window[i - start] = i;
  return window;
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
  widthPx = 0,
): {
  position: "absolute";
  top: "0px";
  left: "0px";
  right?: "0px" | "auto";
  width?: string;
  height: string;
  transform: string;
  visibility?: "hidden";
} {
  return {
    position: "absolute",
    top: "0px",
    left: "0px",
    ...(widthPx > 0 ? { width: `${widthPx}px`, right: "auto" as const } : { right: "0px" as const }),
    height: `${itemHeight}px`,
    transform: virtualRowTransform(index, itemHeight, shiftRows),
    ...(visible ? {} : { visibility: "hidden" as const }),
  };
}

/** flow 前导空白：未挂载原点之前的行高。 */
export function virtualFlowLeadHeight(origin: number, itemHeight: number): number {
  return Math.max(0, origin) * Math.max(0, itemHeight);
}

/** flow 尾部空白：池外未挂载行高。 */
export function virtualFlowTailHeight(
  count: number,
  origin: number,
  poolSize: number,
  itemHeight: number,
): number {
  const mounted = Math.max(0, origin) + Math.max(0, poolSize);
  return Math.max(0, count - mounted) * Math.max(0, itemHeight);
}

/** flow 簇钉在原点行顶。子行进文档流；禁止再用 lead/tail gap 改 spacer 触发整窗回流。 */
export function virtualClusterStyle(
  origin: number,
  itemHeight: number,
  widthPx = 0,
): {
  position: "absolute";
  top: string;
  left: "0px";
  right?: "0px" | "auto";
  width?: string;
} {
  return {
    position: "absolute",
    top: `${virtualRowTop(origin, itemHeight)}px`,
    left: "0px",
    ...(widthPx > 0 ? { width: `${widthPx}px`, right: "auto" as const } : { right: "0px" as const }),
  };
}

/** 流式行盒。禁止 abspos / translate3d，否则 Range 碎成多段。未绑定槽高度为 0。 */
export function virtualFlowRowStyle(
  itemHeight: number,
  visible = true,
  widthPx = 0,
): {
  position: "relative";
  height: string;
  width?: string;
  visibility?: "hidden";
  overflow?: "hidden";
} {
  return {
    position: "relative",
    height: visible ? `${itemHeight}px` : "0px",
    ...(widthPx > 0 && visible ? { width: `${widthPx}px` } : {}),
    ...(visible ? {} : { visibility: "hidden" as const, overflow: "hidden" as const }),
  };
}

/** 视口内容宽：clientWidth 含 padding，行 / 投放框 / fill 只吃内容盒，不进侧轨。 */
export function virtualContentWidth(clientWidth: number, paddingInline = 0): number {
  return Math.max(0, clientWidth - Math.max(0, paddingInline));
}

/** abspos 行不撑 scrollWidth；inner 必须显式宽。0 = 跟视口（不设 width）。 */
export function virtualInnerWidth(contentWidth: number, viewportWidth: number): number {
  if (!(contentWidth > 0)) return 0;
  return Math.max(contentWidth, Math.max(0, viewportWidth));
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
