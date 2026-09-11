/**
 * 命令管理右栏目标：由选区一次算出，禁止在 JSX 里嵌套 Show 猜 kind。
 */

import type { DraftBlock, DraftCommand, DraftEntry, DraftGroup } from "../draft";

const UNNAMED_GROUP = "未命名组";

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
  const groupName = input.group?.name || UNNAMED_GROUP;
  if (input.entry?.kind === "command") {
    return { kind: "command", command: input.entry, groupName };
  }
  if (input.entry?.kind === "block") {
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
  return target.kind === "command" ? target.command : undefined;
}

export function asBlock(target: EditorTarget): DraftBlock | undefined {
  return target.kind === "block" ? target.block : undefined;
}

export function asGroup(target: EditorTarget): DraftGroup | undefined {
  return target.kind === "group" ? target.group : undefined;
}

export function multiCount(target: EditorTarget): number | undefined {
  return target.kind === "multi" ? target.count : undefined;
}
