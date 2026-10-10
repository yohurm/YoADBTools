/**
 * 命令管理中栏：条目操作面板。
 * 与组栏同一套行：贴齐、点按铺满、默认 Ripple 圆角、名称间 hairline。四边留白与菜单井同一档。
 * 功能比组栏多：多选、行菜单。
 */

import { YoBadge, YoIconButton, YoOpsItem, YoPanel, YoSubheader, YoToolbar, YoVirtualList, controlRowHeight, opsListBindings, pointerSelectMode } from "@yohu/ui";

import { entryIsBlock } from "@yohu/api";
import type { DraftEntry } from "../draft";
import { draftRowTitle } from "./editor-target";
import type { CommandManagerStore } from "./store";

function entryColumnLabel(): string {
  return "条目";
}

function EntryRow(props: { item: DraftEntry; index: number }) {
  return (
    <YoOpsItem
      title={draftRowTitle(props.item.name)}
      trailing={entryIsBlock(props.item) ? <YoBadge text="块" tone="neutral" /> : undefined}
    />
  );
}

export function EntryColumn(props: {
  store: CommandManagerStore;
  onContextMenu: (entry: DraftEntry, event: MouseEvent) => void;
}) {
  const entries = (): DraftEntry[] => props.store.selectedEntries();
  const rowHeight = controlRowHeight();

  return (
    <YoPanel class="yohu-cm__entries" variant="pane" overflow="hidden" padding="sm" role="ops" header={
      <YoToolbar pad="xs">
        <YoSubheader title={entryColumnLabel()} pad="flush" />
        <YoIconButton icon="plus" title="新增命令" onClick={() => props.store.addCommand()} />
        <YoIconButton icon="block" title="新增命令块" onClick={() => props.store.addBlock()} />
        <YoIconButton icon="trash" title="删除条目" onClick={() => props.store.removeEntries()} />
      </YoToolbar>
    }>
      <YoVirtualList
        class="yohu-cm__list"
        items={entries}
        itemHeight={rowHeight}
        getItemKey={(entry) => entry.id}
        ariaLabel={entryColumnLabel()}
        renderRow={EntryRow}
        {...opsListBindings<DraftEntry>({
          features: ["multi", "reorder", "menu", "rule"],
          selectedKeys: () => props.store.selectedEntrySet(),
          onSelectRow: (entry, _key, event) => {
            props.store.selectEntry(entry.id, pointerSelectMode(event));
          },
          onReorder: props.store.selectedEntrySet().size < 2
            ? (from, to) => props.store.moveEntryTo(from, to)
            : undefined,
          onRowContextMenu: (entry, _key, event) => {
            props.onContextMenu(entry, event);
          },
        })}
      />
    </YoPanel>
  );
}
