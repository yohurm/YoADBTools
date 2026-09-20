/**
 * 虚拟列表交互策略（L3）。
 * 键盘动作、贴底排放、聚焦确认与行/宿主 attrs 从快照组装。
 * fill 热态代数在此；指针会话在 virtuallist-hot。
 * 行铬在 list-row；本文件只出身份 / aria，不写色值、不画铬。
 */

import {
  VIRTUAL_DEFAULT_TONE,
  virtualKeyIntent,
  virtualRowTabIndex,
  type VirtualKeyIntent,
} from "./virtuallist-model";

export type VirtualListKeyAction = VirtualKeyIntent;

export type VirtualIndicatorHot = "hover" | "pressed";

/** follow 且未换位才挂 fill。 */
export function virtualIndicatorFill(follow: string | undefined, reordering: boolean): boolean {
  return follow != null && !reordering;
}

/** 选中填充行才 hover/pressed；无 fill 或未命中清空。 */
export function resolveVirtualIndicatorHot(input: {
  fill: boolean;
  onSelectedFill: boolean;
  pressed: boolean;
}): VirtualIndicatorHot | undefined {
  if (!input.fill || !input.onSelectedFill) return undefined;
  return input.pressed ? "pressed" : "hover";
}

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
  "data-tone": "document" | "list";
  "data-reordering": "" | undefined;
  "data-indicator": "fill" | undefined;
  "data-indicator-hot": VirtualIndicatorHot | undefined;
}

export function virtualHostAttrs(input: {
  selectable: boolean;
  multi: boolean;
  tone?: "document" | "list";
  ariaLabel?: string;
  reordering?: boolean;
  indicatorFill?: boolean;
  indicatorHot?: VirtualIndicatorHot;
}): VirtualHostAttrs {
  const fill = input.indicatorFill === true;
  return {
    role: input.selectable ? "listbox" : undefined,
    "aria-label": input.selectable ? input.ariaLabel : undefined,
    "aria-multiselectable": input.multi ? true : undefined,
    "data-tone": input.tone ?? VIRTUAL_DEFAULT_TONE,
    "data-reordering": input.reordering ? "" : undefined,
    "data-indicator": fill ? "fill" : undefined,
    "data-indicator-hot": fill ? input.indicatorHot : undefined,
  };
}
