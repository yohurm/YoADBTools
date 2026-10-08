/**
 * 命令库树：点组只开合，不入队；点叶子入队命令/块（需填值则交给 View 开弹窗）。
 */

import { Show, createMemo } from "solid-js";

import { YoBadge, YoEmptyState, YoTree } from "@yohu/ui";
import type { TreeNode } from "@yohu/ui";
import type { CommandGroupDto, LibraryEntryDto } from "@yohu/api";

import { commandBlockSummary } from "./block-gap";

import { entryIsCommand } from "@yohu/api";
import { commandCopyText, entryNeedsInput, libraryEntryIcon } from "./command-line";
import { libraryGroupKey } from "./library-expand";
import { terminalStore } from "./store";

function libraryCommandKey(id: string): string {
  return `c:${id}`;
}

function libraryBlockKey(id: string): string {
  return `b:${id}`;
}

function entryNodeLabel(entry: { name: string }): { label: string } {
  return { label: entry.name };
}

function entryNodeData(entry: LibraryEntryDto): { data: LibraryEntryDto } {
  return { data: entry };
}

function isGroup(data: LibraryEntryDto | CommandGroupDto | undefined): data is CommandGroupDto {
  return data != null && "entries" in data && !("kind" in data);
}

export function CommandTree(props: {
  groups: CommandGroupDto[];
  sourceEmpty: boolean;
  expandedKeys: string[];
  onToggle?: (key: string) => void;
  onNeedValues: (entry: LibraryEntryDto) => void;
}) {
  const treeData = createMemo<TreeNode<LibraryEntryDto | CommandGroupDto>[]>(() =>
    props.groups.map((group) => ({
      key: libraryGroupKey(group.id),
      label: group.name,
      icon: "folder" as const,
      data: group,
      badge: String(group.entries.length),
      children: group.entries.map((entry) =>
        entryIsCommand(entry)
          ? {
              key: libraryCommandKey(entry.id),
              ...entryNodeLabel(entry),
              icon: libraryEntryIcon(entry.kind),
              ...entryNodeData(entry),
              title: commandCopyText(entry.template),
            }
          : {
              key: libraryBlockKey(entry.id),
              ...entryNodeLabel(entry),
              icon: libraryEntryIcon(entry.kind),
              ...entryNodeData(entry),
              title: commandBlockSummary(entry.steps.length, entry.gap_ms),
            },
      ),
    })),
  );

  const onSelect = (_key: string, node: TreeNode<LibraryEntryDto | CommandGroupDto>): void => {
    if (isGroup(node.data)) return;
    const entry = node.data;
    if (!entry) return;
    if (entryNeedsInput(entry)) {
      props.onNeedValues(entry);
      return;
    }
    terminalStore.enqueueEntry(entry, []);
  };

  return (
    <Show
      when={treeData().length > 0}
      fallback={
        <YoEmptyState
          fill
          icon="terminal"
          title={props.sourceEmpty ? "命令库为空" : "无匹配命令"}
          description={props.sourceEmpty ? "点击「命令管理」添加命令" : "换个关键词试试"}
        />
      }
    >
      <YoTree
        data={treeData()}
        expandedKeys={props.expandedKeys}
        onToggle={props.onToggle}
        onSelect={onSelect}
        renderBadge={(text) => <YoBadge text={text} />}
      />
    </Show>
  );
}
