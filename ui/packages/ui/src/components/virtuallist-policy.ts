/**
 * 虚拟列表交互策略（L3）。
 * 键盘动作、贴底排放、聚焦确认与行/宿主 attrs 从快照组装。
 * 不写色值、不画铬、不碰 JSX。
 */

import {
  VIRTUAL_DEFAULT_TONE,
  virtualKeyIntent,
  virtualRowJoin,
  virtualRowTabIndex,
  type VirtualKeyIntent,
} from "./virtuallist-model";

export type VirtualListKeyAction = VirtualKeyIntent;

export function resolveVirtualListKeyAction(
  key: string,
  index: number,
  count: number,
): VirtualListKeyAction | null {
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
  selStart: boolean;
  selMid: boolean;
  selEnd: boolean;
}

export function virtualRowAttrs(input: {
  key: string | number;
  selectable: boolean;
  selected: boolean;
  prevSelected: boolean;
  nextSelected: boolean;
  selectionEmpty: boolean;
  isFirstVisible: boolean;
}): VirtualRowAttrs {
  const join = virtualRowJoin(input.selected, input.prevSelected, input.nextSelected);
  return {
    "data-key": input.key,
    role: input.selectable ? "option" : undefined,
    "aria-selected": input.selectable ? input.selected : undefined,
    tabIndex: virtualRowTabIndex({
      selectable: input.selectable,
      selected: input.selected,
      selectionEmpty: input.selectionEmpty,
      isFirstVisible: input.isFirstVisible,
    }),
    interactive: input.selectable,
    selected: input.selectable && input.selected,
    selStart: join === "start",
    selMid: join === "middle",
    selEnd: join === "end",
  };
}

export interface VirtualHostAttrs {
  role: "listbox" | undefined;
  "aria-label": string | undefined;
  "aria-multiselectable": true | undefined;
  "data-tone": "document" | "list";
  "data-reordering": "" | undefined;
}

export function virtualHostAttrs(input: {
  selectable: boolean;
  multi: boolean;
  tone?: "document" | "list";
  ariaLabel?: string;
  reordering?: boolean;
}): VirtualHostAttrs {
  return {
    role: input.selectable ? "listbox" : undefined,
    "aria-label": input.selectable ? input.ariaLabel : undefined,
    "aria-multiselectable": input.multi ? true : undefined,
    "data-tone": input.tone ?? VIRTUAL_DEFAULT_TONE,
    "data-reordering": input.reordering ? "" : undefined,
  };
}
