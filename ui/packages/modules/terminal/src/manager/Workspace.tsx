/**
 * 命令管理三栏工作区：组 / 条目 / 编辑。
 * 键位与栏视图在此组合；Dialog 壳与保存仍在 CommandManager。
 */

import { createEffect, createSignal, onCleanup } from "solid-js";

import { attachPanelKeys } from "@yohu/ui";

import type { DraftEntry } from "../draft";
import { COMMAND_MANAGER_KEY_BINDINGS, COMMAND_MANAGER_LIST_SELECTOR, commandManagerKeyIsSelectAll } from "./keys";
import type { MigrateApi } from "./MigrateLayer";
import { MigrateLayer } from "./MigrateLayer";
import type { CommandManagerStore } from "./store";
import { EditorColumn } from "./EditorColumn";
import { EntryColumn } from "./EntryColumn";
import { GroupColumn } from "./GroupColumn";

export function ManagerWorkspace(props: {
  store: CommandManagerStore;
  onContextMenu: (entry: DraftEntry, event: MouseEvent) => void;
  bindMigrate: (api: MigrateApi) => void;
}) {
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const [dropKey, setDropKey] = createSignal<string | null>(null);
  const [migrating, setMigrating] = createSignal(false);
  let flyTo = (groupId: string): void => {
    props.store.moveEntriesTo(groupId);
  };

  createEffect(() => {
    const el = root();
    if (!props.store.ui.open || !el) return;
    const stop = attachPanelKeys(el, {
      listSelector: COMMAND_MANAGER_LIST_SELECTOR,
      bindings: COMMAND_MANAGER_KEY_BINDINGS,
      onAction: (action) => {
        if (commandManagerKeyIsSelectAll(action)) props.store.selectAllEntries();
      },
    });
    onCleanup(stop);
  });

  const canMigrate = (): boolean => {
    const id = props.store.ui.selectedGroupId;
    if (!id || props.store.selectedEntrySet().size < 2) return false;
    return props.store.draft.groups.some((group) => group.id !== id);
  };

  return (
    <div
      class="yohu-cm"
      ref={setRoot}
      data-migrate-source={canMigrate() ? "" : undefined}
      data-migrating={migrating() ? "" : undefined}
    >
      <GroupColumn store={props.store} dropKey={dropKey} />
      <EntryColumn store={props.store} onContextMenu={props.onContextMenu} />
      <EditorColumn store={props.store} onMoveTo={(groupId) => flyTo(groupId)} />
      <MigrateLayer
        store={props.store}
        root={root}
        onOver={setDropKey}
        onActive={setMigrating}
        bind={(api) => {
          flyTo = api.flyTo;
          props.bindMigrate(api);
        }}
      />
    </div>
  );
}
