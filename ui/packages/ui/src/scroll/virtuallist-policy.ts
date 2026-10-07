/**
 * 虚拟列表交互策略（L3）。
 * 键盘动作、贴底排放、聚焦确认与行/宿主 attrs 从快照组装。
 * 行铬在 list-row；本文件只出身份 / aria，不写色值、不画铬。
 */
import { presenceAttr, trueAttr } from "../dom/flag";
import type { YoListRowTone } from "../list-row/list-row-model";

import {
  resolveVirtualListTone,
  virtualKeyIntent,
  virtualListLayout,
  virtualRowTabIndex,
  type VirtualKeyIntent,
  type VirtualListLayout,
} from "./virtuallist-model";

export function resolveVirtualListKeyAction(
  key: string,
  index: number,
  count: number,
): VirtualKeyIntent | null {
  return virtualKeyIntent(key, index, count);
}

export function shouldEmitAtBottom(
  isAutoScrolling: boolean,
  atBottom: boolean,
  lastAtBottom: boolean,
): boolean {
  if (isAutoScrolling) return false;
  return atBottom !== lastAtBottom;
}

/** 单选看 selectedKey；多选 selectedKey 恒 null，改看 selectedKeys 是否含目标。 */
export function isPendingFocusAdopted(
  pendingFocusKey: string | number | null,
  multi: boolean,
  selectedKey?: string | number | null,
  selectedKeys?: ReadonlySet<string | number> | null,
): boolean {
  if (pendingFocusKey === null) return false;
  return multi
    ? selectedKeys != null && selectedKeys.has(pendingFocusKey)
    : selectedKey === pendingFocusKey;
}

export interface VirtualRowAttrs {
  "data-key": string | number;
  role: "option" | undefined;
  "aria-selected": boolean | undefined;
  tabIndex: number | undefined;
  interactive: boolean;
  selected: boolean;
}

export function virtualRowAttrs(input: {
  key: string | number;
  selectable: boolean;
  selected: boolean;
  active: boolean;
  selectionEmpty: boolean;
  isFirstVisible: boolean;
}): VirtualRowAttrs {
  return {
    "data-key": input.key,
    role: input.selectable ? "option" : undefined,
    "aria-selected": input.selectable ? input.selected : undefined,
    tabIndex: virtualRowTabIndex({
      selectable: input.selectable,
      active: input.active,
      selectionEmpty: input.selectionEmpty,
      isFirstVisible: input.isFirstVisible,
    }),
    interactive: input.selectable,
    selected: input.selectable && input.selected,
  };
}

export interface VirtualHostAttrs {
  role: "listbox" | undefined;
  "aria-label": string | undefined;
  "aria-multiselectable": true | undefined;
  "data-tone": YoListRowTone;
  "data-layout": VirtualListLayout;
  "data-reordering": "" | undefined;
}

export function virtualHostAttrs(input: {
  selectable: boolean;
  multi: boolean;
  tone?: YoListRowTone;
  ariaLabel?: string;
  reordering?: boolean;
  layout?: VirtualListLayout;
}): VirtualHostAttrs {
  const tone = resolveVirtualListTone(input.tone);
  return {
    role: input.selectable ? "listbox" : undefined,
    "aria-label": input.selectable ? input.ariaLabel : undefined,
    "aria-multiselectable": trueAttr(input.multi),
    "data-tone": tone,
    "data-layout":
      input.layout ??
      virtualListLayout({
        tone,
        selectable: input.selectable,
        reordering: input.reordering === true,
      }),
    "data-reordering": presenceAttr(input.reordering === true),
  };
}
