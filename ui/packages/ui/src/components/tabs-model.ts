/**
 * 标签页领域模型（L2）。
 * 激活身份与键盘意图是不变式；不碰 DOM / 不组装 aria。
 */

export interface TabsIdentity {
  id: string;
}

export type TabsKeyIntent = { type: "activate"; index: number } | { type: "close"; index: number };

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
  const current = activeIndex >= 0 ? activeIndex : 0;
  switch (key) {
    case "ArrowRight":
      return { type: "activate", index: (current + 1) % count };
    case "ArrowLeft":
      return { type: "activate", index: (current - 1 + count) % count };
    case "Home":
      return { type: "activate", index: 0 };
    case "End":
      return { type: "activate", index: count - 1 };
    case "Delete":
      if (canClose && activeIndex >= 0) return { type: "close", index: activeIndex };
      return null;
    default:
      return null;
  }
}

/** 关闭后焦点落到相邻 tab（关闭由上层完成后再聚焦）。 */
export function closeFocusIndex(closedIndex: number, countBeforeClose: number): number {
  return Math.min(closedIndex, countBeforeClose - 2);
}
