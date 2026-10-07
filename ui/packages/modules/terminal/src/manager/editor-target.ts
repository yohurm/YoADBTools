/**
 * 命令管理右栏目标：由选区一次算出，禁止在 JSX 里嵌套 Show 猜 kind。
 */

import { entryIsBlock, entryIsCommand } from "@yohu/api";
import type { DraftBlock, DraftCommand, DraftEntry, DraftGroup } from "../draft";

const UNNAMED_GROUP = "未命名组";
const DRAFT_ROW_UNNAMED = "（未命名）";

function nameOrFallback(name: string | undefined, fallback: string): string {
  return name || fallback;
}

/** 组栏和条目栏的空名称。编辑区组标题仍用「未命名组」。 */
export function draftRowTitle(name: string): string {
  return nameOrFallback(name, DRAFT_ROW_UNNAMED);
}

export type EditorTarget =
  | { kind: "empty" }
  | { kind: "multi"; count: number }
  | { kind: "group"; group: DraftGroup }
  | { kind: "command"; command: DraftCommand; groupName: string }
  | { kind: "block"; block: DraftBlock; groupName: string };

export function editorTarget(input: {
  group: DraftGroup | undefined;
  entry: DraftEntry | undefined;
  selectedEntryCount: number;
}): EditorTarget {
  const groupName = nameOrFallback(input.group?.name, UNNAMED_GROUP);
  if (input.entry && entryIsCommand(input.entry)) {
    return { kind: "command", command: input.entry, groupName };
  }
  if (input.entry && entryIsBlock(input.entry)) {
    return { kind: "block", block: input.entry, groupName };
  }
  if (input.selectedEntryCount > 1) {
    return { kind: "multi", count: input.selectedEntryCount };
  }
  if (input.group) {
    return { kind: "group", group: input.group };
  }
  return { kind: "empty" };
}

export function editorPaneTitle(target: EditorTarget): string | undefined {
  switch (target.kind) {
    case "command":
      return `命令属性 · ${target.groupName}`;
    case "block":
      return `命令块 · ${target.groupName}`;
    case "group":
      return "组属性";
    case "multi":
    case "empty":
      return undefined;
  }
}

export function asCommand(target: EditorTarget): DraftCommand | undefined {
  return entryIsCommand(target) ? target.command : undefined;
}

export function asBlock(target: EditorTarget): DraftBlock | undefined {
  return entryIsBlock(target) ? target.block : undefined;
}

/** 右栏没有可编辑目标。空态只认这一把。 */
export function editorTargetIsEmpty(
  target: EditorTarget,
): target is Extract<EditorTarget, { kind: "empty" }> {
  return target.kind === "empty";
}

/** 右栏目标是整组。铺表单和取出组都认这一把。 */
export function editorTargetIsGroup(
  target: EditorTarget,
): target is Extract<EditorTarget, { kind: "group" }> {
  return target.kind === "group";
}

/** 右栏要铺表单：一条命令、一个命令块，或整组。空选和多选不铺。 */
export function editorShowsForm(target: EditorTarget): boolean {
  return entryIsCommand(target) || entryIsBlock(target) || editorTargetIsGroup(target);
}

export function asGroup(target: EditorTarget): DraftGroup | undefined {
  return editorTargetIsGroup(target) ? target.group : undefined;
}

export function multiCount(target: EditorTarget): number | undefined {
  return target.kind === "multi" ? target.count : undefined;
}
