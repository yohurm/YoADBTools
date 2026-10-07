/**
 * 树领域模型（L2）。
 * 可见行扁平化、父子关系与键盘意图是不变式；不碰 DOM / 不组装 aria。
 */

import { clampListIndex, horizontalListDelta, listActivateKey, verticalListDelta } from "../keymap/list-index";

export type TreeKeyIntent =
  | { type: "focus"; index: number }
  | { type: "toggle" }
  | { type: "parent" }
  | { type: "select" };

export interface TreeWalkNode {
  key: string;
  children?: TreeWalkNode[];
}

export function flattenVisible<T extends TreeWalkNode>(
  data: T[],
  isExpanded: (key: string) => boolean,
): { node: T; depth: number }[] {
  const result: { node: T; depth: number }[] = [];
  const walk = (nodes: T[], depth: number): void => {
    for (const node of nodes) {
      result.push({ node, depth });
      if (node.children && node.children.length > 0 && isExpanded(node.key)) {
        walk(node.children as T[], depth + 1);
      }
    }
  };
  walk(data, 0);
  return result;
}

export function parentIndex(rows: readonly { depth: number }[], index: number): number | null {
  const current = rows[index];
  if (!current) return null;
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i]!.depth < current.depth) return i;
  }
  return null;
}

/** 目录只开合；叶子才选中。 */
export function treeActivateIntent(hasChildren: boolean): "toggle" | "select" {
  return hasChildren ? "toggle" : "select";
}

/** 点击落在目录上。叶子是其余分支。 */
export function treeActivateIsToggle(hasChildren: boolean): boolean {
  return treeActivateIntent(hasChildren) === "toggle";
}

/** 未识别返回 null。 */
export function treeKeyIntent(
  key: string,
  index: number,
  count: number,
  hasChildren: boolean,
  expanded: boolean,
): TreeKeyIntent | null {
  if (count === 0) return null;
  const clamped = clampListIndex(index, count);
  const delta = verticalListDelta(key);
  if (delta !== null) return { type: "focus", index: clampListIndex(clamped + delta, count) };
  const lateral = horizontalListDelta(key);
  if (lateral === 1) {
    if (hasChildren && !expanded) return { type: "toggle" };
    return { type: "focus", index: clampListIndex(clamped + 1, count) };
  }
  if (lateral === -1) {
    if (hasChildren && expanded) return { type: "toggle" };
    return { type: "parent" };
  }
  if (listActivateKey(key)) return { type: treeActivateIntent(hasChildren) };
  return null;
}

/** 属性值选择器转义（引号/反斜杠），避免依赖 CSS.escape（jsdom 缺失）。 */
export function treeKeySelector(key: string): string {
  return `[data-tree-key="${String(key).replace(/[\\"]/g, (c) => (c === '"' ? '\\"' : "\\\\"))}"]`;
}

export function treeHasChildren(node: { children?: readonly unknown[] } | undefined): boolean {
  return Boolean(node?.children && node.children.length > 0);
}
