/**
 * 命令管理中栏：条目 listbox。选区与指示器走 YoVirtualList 多选。
 */

import { Show } from "solid-js";

import {
  Density,
  YoBadge,
  YoIconButton,
  YoToolbar,
  YoVirtualList,
  pointerSelectMode,
} from "@yohu/ui";

import type { DraftEntry } from "../draft";
import type { CommandManagerStore } from "./store";

export function EntryColumn(props: {
  store: CommandManagerStore;
  onContextMenu: (entry: DraftEntry, event: MouseEvent) => void;
}) {
  const entries = (): DraftEntry[] => props.store.selectedGroup()?.entries ?? [];

  return (
    <div class="yohu-cm__commands">
      <YoToolbar pad="xs">
        <span class="yohu-cm__caption">条目</span>
        <YoIconButton icon="plus" title="新增命令" onClick={() => props.store.addCommand()} />
        <YoIconButton icon="list" title="新增命令块" onClick={() => props.store.addBlock()} />
        <YoIconButton icon="trash" title="删除条目" onClick={() => props.store.removeEntries()} />
      </YoToolbar>
      <div class="yohu-cm__list">
        <YoVirtualList<DraftEntry>
          items={entries}
          itemHeight={Density.Comfortable.controlHeight}
          getItemKey={(entry) => entry.id}
          ariaLabel="条目"
          selectedKeys={() => props.store.selectedEntrySet()}
          onSelectRow={(entry, _key, event) => {
            props.store.selectEntry(entry.id, pointerSelectMode(event));
          }}
          onRowContextMenu={(entry, _key, event) => {
            props.onContextMenu(entry, event);
          }}
          renderRow={(entry) => (
            <div class="yohu-cm__row">
              <span class="yohu-cm__row-name">{entry.name || "（未命名）"}</span>
              <Show when={entry.kind === "block"}>
                <YoBadge text="块" tone="neutral" />
              </Show>
            </div>
          )}
        />
      </div>
    </div>
  );
}
