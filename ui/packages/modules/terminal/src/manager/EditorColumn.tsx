/**
 * 命令管理右栏：选区 → createMemo(editorTarget) → 互斥 Show。
 * 铬走 YoPanel pane，与组 / 条目对齐高度与圆角。字段 hug 靠顶（fill 只铺宽）。
 * 有页眉时栏标题走 Toolbar children 的 YoSubheader；禁止 YoPanel title / YoToolbar title。
 */

import { Show, createMemo } from "solid-js";

import { YoEmptyState, YoPanel, YoScroller, YoSubheader, YoTextField, YoToolbar } from "@yohu/ui";

import { BlockEditor } from "./BlockEditor";
import { CommandEditor } from "./CommandEditor";
import {
  asBlock,
  asCommand,
  asGroup,
  editorPaneTitle,
  editorTarget,
  multiCount,
} from "./editor-target";
import type { CommandManagerStore } from "./store";

export function EditorColumn(props: { store: CommandManagerStore }) {
  const target = createMemo(() =>
    editorTarget({
      group: props.store.selectedGroup(),
      entry: props.store.selectedEntry(),
      selectedEntryCount: props.store.ui.selectedEntryIds.length,
    }),
  );
  const title = createMemo(() => editorPaneTitle(target()));

  return (
    <YoPanel
      class="yohu-cm__editor"
      variant="pane"
      padding="md"
      overflow="hidden"
      header={
        title() ? (
          <YoToolbar pad="xs">
            <YoSubheader title={title()!} pad="flush" />
          </YoToolbar>
        ) : undefined
      }
    >
      <Show when={target().kind === "empty"}>
        <YoEmptyState fill size="sm" title="选择左侧命令组，或新建一组" />
      </Show>
      <Show when={multiCount(target())}>
        {(count) => <YoEmptyState fill size="sm" title={`已选 ${count()} 条`} />}
      </Show>
      <Show when={target().kind === "command" || target().kind === "block" || target().kind === "group"}>
        <YoScroller>
          <div class="yohu-cm__editor-stack">
          <Show when={asCommand(target())} keyed>
            {(command) => <CommandEditor command={command} store={props.store} />}
          </Show>
          <Show when={asBlock(target())} keyed>
            {(block) => <BlockEditor block={block} store={props.store} />}
          </Show>
          <Show when={asGroup(target())} keyed>
            {(group) => (
              <YoTextField
                block
                label="组名称"
                value={group.name}
                onInput={(v) => props.store.updateGroupName(group.id, v)}
              />
            )}
          </Show>
          </div>
        </YoScroller>
      </Show>
    </YoPanel>
  );
}
