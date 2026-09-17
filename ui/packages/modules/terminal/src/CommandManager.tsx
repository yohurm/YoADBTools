/**
 * 命令管理 Dialog：绑模块单例、保存全量提交、打开右键菜单。
 * 草稿与选区在 manager/store；禁止 effect 里自动 load。
 */

import { Show, createEffect, createSignal, onCleanup } from "solid-js";

import { errorText } from "@yohu/api";
import {
  YoBadge,
  YoButton,
  YoDialog,
  YoToaster,
  attachPanelKeys,
  closeContextMenu,
  createToaster,
  openContextMenu,
} from "@yohu/ui";

import { commandCopyLines } from "./command-line";
import { terminalCommandMenu } from "./menu";
import type { DraftEntry } from "./draft";
import { EditorColumn } from "./manager/EditorColumn";
import { EntryColumn } from "./manager/EntryColumn";
import { GroupColumn } from "./manager/GroupColumn";
import { MANAGER_DIALOG } from "./layout";
import { COMMAND_MANAGER_KEY_BINDINGS, COMMAND_MANAGER_LIST_SELECTOR } from "./manager/keys";
import { commandManagerStore } from "./manager/store";
import { terminalStore } from "./store";
import "./command-manager.css";

export function CommandManager() {
  const store = commandManagerStore;
  const toaster = createToaster();
  const [root, setRoot] = createSignal<HTMLDivElement>();

  onCleanup(() => toaster.destroy());

  createEffect(() => {
    const el = root();
    if (!store.ui.open || !el) return;
    const stop = attachPanelKeys(el, {
      listSelector: COMMAND_MANAGER_LIST_SELECTOR,
      bindings: COMMAND_MANAGER_KEY_BINDINGS,
      onAction: (action) => {
        if (action === "select-all") store.selectAllEntries();
      },
    });
    onCleanup(stop);
  });

  const requestClose = (): void => {
    closeContextMenu();
    store.requestClose();
  };

  const save = async (): Promise<void> => {
    store.setSaving(true);
    store.setError("");
    try {
      await terminalStore.save(store.library());
      requestClose();
    } catch (e) {
      store.setError(errorText(e));
    } finally {
      store.setSaving(false);
    }
  };

  const openCommandMenu = (entry: DraftEntry, event: MouseEvent): void => {
    if (!store.ui.selectedEntryIds.includes(entry.id)) {
      store.selectOnly(entry.id);
    }
    const text = commandCopyLines(store.selectedCommands().map((command) => command.template));
    openContextMenu(terminalCommandMenu, {
      x: event.clientX,
      y: event.clientY,
      ctx: {
        canCopy: text.length > 0,
        copy: () => {
          void navigator.clipboard.writeText(text).catch((e: unknown) => {
            const detail = e instanceof Error ? e.message : "复制失败";
            toaster.show(`复制失败: ${detail}`, "error");
          });
        },
        remove: () => store.removeEntries(),
      },
    });
  };

  return (
    <>
      <YoDialog
        open={() => store.ui.open}
        title="命令管理"
        width={MANAGER_DIALOG.width}
        height={MANAGER_DIALOG.height}
        bodyOverflow="hidden"
        bodyPad="none"
        onClose={requestClose}
        onExitComplete={() => store.finishClose()}
        footer={
          <>
            <Show when={store.ui.error}>
              <span class="yohu-cm__error">
                <YoBadge text={store.ui.error} tone="danger" />
              </span>
            </Show>
            <YoButton variant="ghost" tone="accent" onClick={requestClose} disabled={store.ui.saving}>
              取消
            </YoButton>
            <YoButton onClick={() => void save()} loading={store.ui.saving}>
              保存
            </YoButton>
          </>
        }
      >
        <div class="yohu-cm" ref={setRoot}>
          <GroupColumn store={store} />
          <EntryColumn store={store} onContextMenu={openCommandMenu} />
          <EditorColumn store={store} />
        </div>
      </YoDialog>
      <YoToaster toaster={toaster} />
    </>
  );
}
