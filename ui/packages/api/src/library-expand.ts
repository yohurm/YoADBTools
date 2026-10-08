/**
 * 命令库默认展开。身份在 wire（settings.terminal_library_expand）。
 * 树只问本文件：哪种模式、该打开哪些组 id。停留开合不在这里。
 */

const COLLAPSED = "collapsed";
const EXPANDED = "expanded";
const GROUPS = "groups";

export type LibraryExpandMode = typeof COLLAPSED | typeof EXPANDED | typeof GROUPS;

export interface LibraryExpand {
  mode: LibraryExpandMode;
  ids: string[];
}

export const LIBRARY_EXPAND_DEFAULT: LibraryExpand = {
  mode: COLLAPSED,
  ids: [],
};

export const LIBRARY_EXPAND_CATALOG: readonly {
  value: LibraryExpandMode;
  label: string;
}[] = [
  { value: COLLAPSED, label: "全部折叠" },
  { value: EXPANDED, label: "全部展开" },
  { value: GROUPS, label: "指定命令组" },
];

export function isLibraryExpandMode(value: string): value is LibraryExpandMode {
  return LIBRARY_EXPAND_CATALOG.some((item) => item.value === value);
}

export function libraryExpandIsCollapsed(policy: LibraryExpand): boolean {
  return policy.mode === COLLAPSED;
}

export function libraryExpandIsExpanded(policy: LibraryExpand): boolean {
  return policy.mode === EXPANDED;
}

export function libraryExpandIsGroups(policy: LibraryExpand): boolean {
  return policy.mode === GROUPS;
}

export function libraryExpandGroupsLabel(): string {
  const item = LIBRARY_EXPAND_CATALOG.find((entry) => entry.value === GROUPS);
  return item ? item.label : "";
}

/** 切模式时保留已选组 id。 */
export function libraryExpandWithMode(policy: LibraryExpand, mode: LibraryExpandMode): LibraryExpand {
  return { mode, ids: [...policy.ids] };
}

/** 勾选写入指定组模式。已在名单里的 id 保持原位；新勾选追加到末尾。 */
export function libraryExpandWithGroup(policy: LibraryExpand, id: string, open: boolean): LibraryExpand {
  if (open && libraryExpandHasGroup(policy, id)) return { mode: GROUPS, ids: [...policy.ids] };
  if (!open) return { mode: GROUPS, ids: policy.ids.filter((item) => item !== id) };
  return { mode: GROUPS, ids: [...policy.ids, id] };
}

export function libraryExpandHasGroup(policy: LibraryExpand, id: string): boolean {
  return policy.ids.includes(id);
}

/**
 * 策略要求打开的组 id，顺序跟当前库。
 * 折叠忽略名单；展开打开库里每一组；指定组只留名单与库的交集。
 */
export function libraryExpandGroupIds(policy: LibraryExpand, groupIds: readonly string[]): string[] {
  if (libraryExpandIsCollapsed(policy)) return [];
  if (libraryExpandIsExpanded(policy)) return [...groupIds];
  const allow = new Set(policy.ids);
  return groupIds.filter((id) => allow.has(id));
}
