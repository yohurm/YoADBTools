/**
 * 标签页交互策略（L3）。
 * 激活 / 关闭 / 新建是同一写入口；宿主 aria 与 tabindex 从快照组装。
 * 不写色值、不画下划线。
 */

import {
  closeFocusIndex,
  tabAt,
  tabsActiveIndex,
  tabsKeyIntent,
  type TabsIdentity,
  type TabsKeyIntent,
} from "./tabs-model";

export interface TabsChrome {
  canClose: boolean;
  canNew: boolean;
}

export function resolveTabsChrome(input: { onClose?: unknown; onNew?: unknown }): TabsChrome {
  return {
    canClose: Boolean(input.onClose),
    canNew: Boolean(input.onNew),
  };
}

export interface TabsTabAttrs {
  "aria-selected": boolean;
  tabindex: 0 | -1;
  active: boolean;
}

/** 激活走下划线指示，不用 selected 实底。tabindex 跟随激活项。 */
export function tabsTabAttrs(tabId: string, activeId?: string | null): TabsTabAttrs {
  const active = tabId === activeId;
  return {
    "aria-selected": active,
    tabindex: active ? 0 : -1,
    active,
  };
}

export interface TabsKeyAction {
  type: "activate" | "close";
  id: string;
  index: number;
  focusIndex: number;
}

export function resolveTabsKeyAction(
  key: string,
  tabs: readonly TabsIdentity[],
  activeId: string | null | undefined,
  canClose: boolean,
): TabsKeyAction | null {
  const intent = tabsKeyIntent(key, tabsActiveIndex(tabs, activeId), tabs.length, canClose);
  return intent ? applyTabsKeyIntent(intent, tabs) : null;
}

export function applyTabsKeyIntent(
  intent: TabsKeyIntent,
  tabs: readonly TabsIdentity[],
): TabsKeyAction | null {
  const tab = tabAt(tabs, intent.index);
  if (!tab) return null;
  if (intent.type === "activate") {
    return { type: "activate", id: tab.id, index: intent.index, focusIndex: intent.index };
  }
  return {
    type: "close",
    id: tab.id,
    index: intent.index,
    focusIndex: closeFocusIndex(intent.index, tabs.length),
  };
}
