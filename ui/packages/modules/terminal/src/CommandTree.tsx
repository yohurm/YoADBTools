/**
 * 命令库树：点组只开合，不入队；点叶子入队命令/块（需填值则交给 View 开弹窗）。
 */

import { Show, createMemo } from "solid-js";

import { YoBadge, YoEmptyState, YoTree } from "@yohu/ui";
import type { TreeNode } from "@yohu/ui";
import type { CommandGroupDto, LibraryEntryDto } from "@yohu/api";

import { commandBlockGapLabel } from "./block-gap";

import { entryNeedsInput, formatAdbLine } from "./command-line";
import { terminalStore } from "./store";

function isGroup(data: LibraryEntryDto | CommandGroupDto | undefined): data is CommandGroupDto {
  return data != null && "entries" in data && !("kind" in data);
}

export function CommandTree(props: {
  groups: CommandGroupDto[];
  sourceEmpty: boolean;
  expandedKeys?: string[];
  onNeedValues: (entry: LibraryEntryDto) => void;
}) {
  const treeData = createMemo<TreeNode<LibraryEntryDto | CommandGroupDto>[]>(() =>
    props.groups.map((group) => ({
      key: `g:${group.id}`,
      label: group.name,
      icon: "folder" as const,
      data: group,
      badge: String(group.entries.length),
      children: group.entries.map((entry) =>
        entry.kind === "command"
          ? {
              key: `c:${entry.id}`,
              label: entry.name,
              icon: "terminal" as const,
              data: entry,
              title: formatAdbLine("-", entry.template),
            }
          : {
              key: `b:${entry.id}`,
              label: entry.name,
              icon: "block" as const,
              data: entry,
              title: `${entry.steps.length} 条 · 间隔 ${commandBlockGapLabel(entry.gap_ms)}`,
            },
      ),
    })),
  );

  const expandedKeys = createMemo(() => props.groups.map((group) => `g:${group.id}`));

  const onSelect = (_key: string, node: TreeNode<LibraryEntryDto | CommandGroupDto>): void => {
    if (isGroup(node.data)) return;
    const entry = node.data;
    if (!entry || !("kind" in entry)) return;
    if (entryNeedsInput(entry)) {
      props.onNeedValues(entry);
      return;
    }
    if (entry.kind === "command") {
      terminalStore.enqueueCommand(entry, []);
      return;
    }
    terminalStore.enqueueBlock(entry, []);
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
        defaultExpandedKeys={expandedKeys()}
        onSelect={onSelect}
        renderBadge={(text) => <YoBadge text={text} />}
      />
    </Show>
  );
}
