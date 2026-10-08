/**
 * 命令管理右栏：选区 → createMemo(editorTarget) → 互斥 Show。
 * 铬走 YoPanel pane，与组 / 条目对齐高度与圆角。字段 hug 靠顶（fill 只铺宽）。
 * 有页眉时栏标题走 Toolbar children 的 YoSubheader；禁止 YoPanel title / YoToolbar title。
 */

import { For, Show, createMemo } from "solid-js";

import { YoEmptyState, YoListItem, YoPanel, YoScroller, YoSubheader, YoTextField, YoToolbar } from "@yohu/ui";

import { BlockEditor } from "./BlockEditor";
import { CommandEditor } from "./CommandEditor";
import {
  asBlock,
  asCommand,
  asGroup,
  editorPaneTitle,
  editorShowsForm,
  editorTarget,
  editorTargetIsEmpty,
  draftRowTitle,
  multiCount,
} from "./editor-target";
import { migrateDestinations } from "./migrate";
import type { CommandManagerStore } from "./store";

export function EditorColumn(props: {
  store: CommandManagerStore;
  onMoveTo: (groupId: string) => void;
}) {
  const target = createMemo(() =>
    editorTarget({
      group: props.store.selectedGroup(),
      entry: props.store.selectedEntry(),
      selectedEntryCount: props.store.selectedEntrySet().size,
    }),
  );
  const title = createMemo(() => editorPaneTitle(target()));
  const destinations = createMemo(() => {
    const group = props.store.selectedGroup();
    if (!group) return [];
    return migrateDestinations(props.store.draft.groups, group.id);
  });
  return (
    <YoPanel
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
      <Show when={editorTargetIsEmpty(target())}>
        <YoEmptyState fill size="sm" title="选择左侧命令组，或新建一组" />
      </Show>
      <Show when={multiCount(target())}>
        <YoScroller>
          <div class="yohu-cm__migrate-rest">
            <Show
              when={destinations().length > 0}
              fallback={
                <YoEmptyState
                  size="sm"
                  title="没有其他命令组"
                  description="新建一组后，可以把所选条目移过去"
                />
              }
            >
              <YoSubheader title="移到" pad="flush" />
              <For each={destinations()}>
                {(group) => (
                  <YoListItem
                    role="button"
                    title={draftRowTitle(group.name)}
                    onClick={() => props.onMoveTo(group.id)}
                  />
                )}
              </For>
            </Show>
          </div>
        </YoScroller>
      </Show>
      <Show when={editorShowsForm(target())}>
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
