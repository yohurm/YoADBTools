/**
 * 菜单列表模型（L2）。
 * 可选项下标、步进与 typeahead 匹配是不变式；不碰 DOM / 不解释按键。
 */

export interface MenuListItem {
  label: string;
  disabled?: boolean;
}

export function enabledMenuIndexes(items: readonly MenuListItem[]): number[] {
  const indexes: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (!items[i]?.disabled) indexes.push(i);
  }
  return indexes;
}

export function stepEnabledIndex(
  enabled: readonly number[],
  current: number,
  delta: number,
): number | null {
  if (enabled.length === 0) return null;
  const pos = enabled.indexOf(current);
  const from = pos >= 0 ? pos : delta > 0 ? -1 : 0;
  return enabled[(from + delta + enabled.length) % enabled.length] ?? null;
}

export function edgeEnabledIndex(enabled: readonly number[], edge: "start" | "end"): number | null {
  if (enabled.length === 0) return null;
  return edge === "start" ? enabled[0]! : enabled[enabled.length - 1]!;
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
    const index = (start + step + items.length) % items.length;
    const item = items[index];
    if (!item || item.disabled) continue;
    if (item.label.toLocaleLowerCase().startsWith(needle)) return index;
  }
  return null;
}
