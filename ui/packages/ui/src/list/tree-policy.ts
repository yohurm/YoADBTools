/**
 * 树交互策略（L3）。
 * 展开 / 选中 / 焦点是同一写入口；行 aria 从快照组装。
 * 不写选中底、不画铬。
 */

import { parentIndex, treeHasChildren, treeKeyIntent, type TreeKeyIntent, type TreeWalkNode } from "./tree-model";

export function isTreeControlled(expandedKeys: string[] | Set<string> | undefined): boolean {
  return expandedKeys !== undefined;
}

export function isTreeExpanded(
  key: string,
  expandedKeys: string[] | Set<string> | undefined,
  local: ReadonlySet<string>,
): boolean {
  if (expandedKeys === undefined) return local.has(key);
  return expandedKeys instanceof Set ? expandedKeys.has(key) : expandedKeys.includes(key);
}

export function toggleExpandedSet(prev: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export interface TreeRowAttrs {
  selected: boolean;
  focused: boolean;
  tabindex: 0 | -1;
  "aria-selected": boolean;
  "aria-expanded": boolean | undefined;
}

export function treeRowAttrs(input: {
  key: string;
  selectedKey: string | null;
  focusedKey: string | null;
  hasChildren: boolean;
  expanded: boolean;
}): TreeRowAttrs {
  const selected = input.key === input.selectedKey;
  const focused = input.key === input.focusedKey;
  return {
    selected,
    focused,
    tabindex: focused ? 0 : -1,
    "aria-selected": selected,
    "aria-expanded": input.hasChildren ? input.expanded : undefined,
  };
}

export type TreeKeyAction =
  | { type: "focus"; key: string }
  | { type: "toggle"; key: string }
  | { type: "select"; key: string };

export function applyTreeKeyIntent<T extends TreeWalkNode>(
  intent: TreeKeyIntent,
  rows: readonly { node: T; depth: number }[],
  currentKey: string,
): TreeKeyAction | null {
  switch (intent.type) {
    case "focus": {
      const next = rows[intent.index];
      return next ? { type: "focus", key: next.node.key } : null;
    }
    case "toggle":
      return { type: "toggle", key: currentKey };
    case "parent": {
      const index = rows.findIndex((row) => row.node.key === currentKey);
      const parent = parentIndex(rows, index);
      return parent !== null ? { type: "focus", key: rows[parent]!.node.key } : null;
    }
    case "select":
      return { type: "select", key: currentKey };
  }
}

export function resolveTreeKeyAction<T extends TreeWalkNode>(
  key: string,
  rows: readonly { node: T; depth: number }[],
  focusedKey: string | null,
  selectedKey: string | null,
  isExpanded: (key: string) => boolean,
): TreeKeyAction | null {
  if (rows.length === 0) return null;
  const focused = focusedKey ?? selectedKey ?? rows[0]!.node.key;
  const index = rows.findIndex((row) => row.node.key === focused);
  const current = index >= 0 ? rows[index]! : rows[0]!;
  const intent = treeKeyIntent(
    key,
    index,
    rows.length,
    treeHasChildren(current.node),
    isExpanded(current.node.key),
  );
  return intent ? applyTreeKeyIntent(intent, rows, current.node.key) : null;
}
