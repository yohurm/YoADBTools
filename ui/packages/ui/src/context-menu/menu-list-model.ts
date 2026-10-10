/**
 * 菜单列表模型（L2）。
 * 可选项下标、步进与 typeahead 匹配是不变式；不碰 DOM / 不解释按键。
 */

import { itemIsEnabled, listEdgeIndex, stepWrappedIndex, type ListEdge } from "../keymap/list-index";

export interface MenuListItem {
  label: string;
  disabled?: boolean;
  children?: readonly unknown[];
}

/** 可展开的二级菜单项：未禁用，且至少有一条子项。 */
export function menuItemIsBranch(item: { disabled?: boolean; children?: readonly unknown[] } | undefined): boolean {
  return itemIsEnabled(item) && (item?.children?.length ?? 0) > 0;
}

/** 项间分割线。末项没有。 */
export function menuItemDrawsRule(index: number, count: number): boolean {
  return index >= 0 && index < count - 1;
}

function enabledAt(enabled: readonly number[], index: number): number | null {
  return enabled[index] ?? null;
}

export function stepEnabledIndex(
  enabled: readonly number[],
  current: number,
  delta: number,
): number | null {
  if (enabled.length === 0) return null;
  const pos = enabled.indexOf(current);
  const from = pos >= 0 ? pos : delta > 0 ? -1 : 0;
  const index = stepWrappedIndex(enabled.length, from, delta);
  return enabledAt(enabled, index);
}

export function edgeEnabledIndex(enabled: readonly number[], edge: ListEdge): number | null {
  const index = listEdgeIndex(enabled.length, edge);
  if (index < 0) return null;
  return enabledAt(enabled, index);
}

/**
 * 从 fromIndex 起找 label 前缀（忽略大小写）。
 * 同一字母连按视为循环到下一项。
 */
export function typeaheadMatchIndex(
  items: readonly MenuListItem[],
  query: string,
  fromIndex: number,
): number | null {
  if (query.length === 0 || items.length === 0) return null;
  const lower = query.toLocaleLowerCase();
  const repeated = lower.length > 1 && [...lower].every((ch) => ch === lower[0]);
  const needle = repeated ? lower[0]! : lower;
  const start = repeated ? fromIndex + 1 : fromIndex;
  for (let step = 0; step < items.length; step++) {
    const index = stepWrappedIndex(items.length, start, step);
    const item = items[index];
    if (!itemIsEnabled(item)) continue;
    if (item.label.toLocaleLowerCase().startsWith(needle)) return index;
  }
  return null;
}
