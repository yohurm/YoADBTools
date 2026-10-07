/**
 * 命令管理左栏：组操作面板。
 * 底色走 YoPanel role=ops（顶栏白、内容灰）。
 * 功能集摊到 YoVirtualList；行内容是 YoOpsItem。只要单选和换位。
 */

import { YoBadge, YoIconButton, YoOpsItem, YoPanel, YoSubheader, YoToolbar, YoVirtualList, controlRowHeight, opsListBindings } from "@yohu/ui";

import type { DraftGroup } from "../draft";
import { draftRowTitle } from "./editor-target";
import type { CommandManagerStore } from "./store";

function groupColumnLabel(): string {
  return "命令组";
}

function GroupRow(props: { item: DraftGroup; index: number }) {
  return (
    <YoOpsItem
      title={draftRowTitle(props.item.name)}
      trailing={<YoBadge text={String(props.item.entries.length)} tone="neutral" />}
    />
  );
}

export function GroupColumn(props: { store: CommandManagerStore }) {
  const groups = (): DraftGroup[] => props.store.draft.groups;
  const rowHeight = controlRowHeight();

  return (
    <YoPanel variant="pane" overflow="hidden" padding="xs" role="ops" header={
      <YoToolbar pad="xs">
        <YoSubheader title={groupColumnLabel()} pad="flush" />
        <YoIconButton icon="plus" title="新增组" onClick={() => props.store.addGroup()} />
        <YoIconButton icon="trash" title="删除组" onClick={() => props.store.removeGroup()} />
      </YoToolbar>
    }>
      <YoVirtualList
        class="yohu-cm__list"
        items={groups}
        itemHeight={rowHeight}
        getItemKey={(group) => group.id}
        ariaLabel={groupColumnLabel()}
        renderRow={GroupRow}
        {...opsListBindings({
          features: ["select", "reorder"],
          selectedKey: () => props.store.ui.selectedGroupId,
          onSelectRow: (group) => props.store.selectGroup(group.id),
          onReorder: (from, to) => props.store.moveGroupTo(from, to),
        })}
      />
    </YoPanel>
  );
}
