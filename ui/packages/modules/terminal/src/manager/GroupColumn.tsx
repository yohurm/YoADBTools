/**
 * 命令管理左栏：组 listbox。选区走 YoVirtualList 单选。
 * 铬走 YoPanel pane，与中栏 / 编辑栏同一圆角。
 */

import { Density, YoBadge, YoIconButton, YoPanel, YoToolbar, YoVirtualList } from "@yohu/ui";

import type { DraftGroup } from "../draft";
import type { CommandManagerStore } from "./store";

export function GroupColumn(props: { store: CommandManagerStore }) {
  const groups = (): DraftGroup[] => props.store.draft.groups;

  return (
    <YoPanel class="yohu-cm__groups" variant="pane" overflow="hidden" header={
      <YoToolbar pad="xs">
        <span class="yohu-cm__caption">命令组</span>
        <YoIconButton icon="plus" title="新增组" onClick={() => props.store.addGroup()} />
        <YoIconButton icon="trash" title="删除组" onClick={() => props.store.removeGroup()} />
      </YoToolbar>
    }>
      <div class="yohu-cm__list">
        <YoVirtualList<DraftGroup>
          items={groups}
          itemHeight={Density.Comfortable.controlHeight}
          getItemKey={(group) => group.id}
          ariaLabel="命令组"
          selectedKey={() => props.store.ui.selectedGroupId}
          onSelectRow={(group) => props.store.selectGroup(group.id)}
          renderRow={(group) => (
            <div class="yohu-cm__row">
              <span class="yohu-cm__row-name">{group.name || "（未命名）"}</span>
              <YoBadge text={String(group.entries.length)} tone="neutral" />
            </div>
          )}
        />
      </div>
    </YoPanel>
  );
}
