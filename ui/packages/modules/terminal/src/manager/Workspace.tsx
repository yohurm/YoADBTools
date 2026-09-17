/**
 * 命令管理三栏工作区：组 / 条目 / 编辑。
 * 键位与栏视图在此组合；Dialog 壳与保存仍在 CommandManager。
 */

import { createEffect, createSignal, onCleanup } from "solid-js";

import { attachPanelKeys } from "@yohu/ui";

import type { DraftEntry } from "../draft";
import { COMMAND_MANAGER_KEY_BINDINGS, COMMAND_MANAGER_LIST_SELECTOR } from "./keys";
import type { CommandManagerStore } from "./store";
import { EditorColumn } from "./EditorColumn";
import { EntryColumn } from "./EntryColumn";
import { GroupColumn } from "./GroupColumn";

export function ManagerWorkspace(props: {
  store: CommandManagerStore;
  onContextMenu: (entry: DraftEntry, event: MouseEvent) => void;
}) {
  const [root, setRoot] = createSignal<HTMLDivElement>();

  createEffect(() => {
    const el = root();
    if (!props.store.ui.open || !el) return;
    const stop = attachPanelKeys(el, {
      listSelector: COMMAND_MANAGER_LIST_SELECTOR,
      bindings: COMMAND_MANAGER_KEY_BINDINGS,
      onAction: (action) => {
        if (action === "select-all") props.store.selectAllEntries();
      },
    });
    onCleanup(stop);
  });

  return (
    <div class="yohu-cm" ref={setRoot}>
      <GroupColumn store={props.store} />
      <EntryColumn store={props.store} onContextMenu={props.onContextMenu} />
      <EditorColumn store={props.store} />
    </div>
  );
}
