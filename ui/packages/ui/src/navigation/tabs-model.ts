/**
 * 标签页领域模型（L2）。
 * 激活身份与键盘意图是不变式；不碰 DOM / 不组装 aria。
 */

import { horizontalListDelta, listEdgeIndex, listEdgeKey, stepWrappedIndex } from "../keymap/list-index";

export interface TabsIdentity {
  id: string;
}

export type TabsKeyKind = "activate" | "close";

export interface TabsKeyIntent {
  type: TabsKeyKind;
  index: number;
}

/** 切到目标页。关闭是另一档。意图和动作都认这一把。 */
export function tabsKeyIsActivate(item: { type: TabsKeyKind }): item is { type: "activate" } {
  return item.type === "activate";
}

/** 已有激活下标。-1 是未命中，箭头与关闭都认这一把。 */
export function tabsIndexIsActive(index: number): boolean {
  return index >= 0;
}

/** 按稳定 id 解析激活下标；未命中为 -1。 */
export function tabsActiveIndex(tabs: readonly TabsIdentity[], activeId?: string | null): number {
  if (activeId == null || activeId === "") return -1;
  return tabs.findIndex((tab) => tab.id === activeId);
}

export function tabAt(tabs: readonly TabsIdentity[], index: number): TabsIdentity | undefined {
  return tabs[index];
}

/** 未识别返回 null（视图不 preventDefault）。activeIndex < 0 时箭头从 0 起算，Delete 不关闭。 */
export function tabsKeyIntent(
  key: string,
  activeIndex: number,
  count: number,
  canClose: boolean,
): TabsKeyIntent | null {
  if (count === 0) return null;
  const current = tabsIndexIsActive(activeIndex) ? activeIndex : 0;
  const delta = horizontalListDelta(key);
  if (delta !== null) return { type: "activate", index: stepWrappedIndex(count, current, delta) };
  const edge = listEdgeKey(key);
  if (edge) return { type: "activate", index: listEdgeIndex(count, edge) };
  if (key === "Delete") {
    if (canClose && tabsIndexIsActive(activeIndex)) return { type: "close", index: activeIndex };
    return null;
  }
  return null;
}

/** 关闭后焦点落到相邻 tab（关闭由上层完成后再聚焦）。 */
export function closeFocusIndex(closedIndex: number, countBeforeClose: number): number {
  return Math.min(closedIndex, countBeforeClose - 2);
}
