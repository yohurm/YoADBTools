/**
 * 命令管理：薄 fill Dialog。草稿在 manager/store，三栏在 ManagerWorkspace。
 * 保存全量提交；右键菜单在此打开。禁止 effect 里自动 load。
 */

import { Show, onCleanup } from "solid-js";

import { errorText } from "@yohu/api";
import {
  YoBadge,
  YoButton,
  YoDialog,
  YoToaster,
  closeContextMenu,
  createToaster,
  openContextMenu,
} from "@yohu/ui";

import { commandCopyLines } from "./command-line";
import { terminalCommandMenu } from "./menu";
import type { DraftEntry } from "./draft";
import { ManagerWorkspace } from "./manager/Workspace";
import { MANAGER_DIALOG } from "./layout";
import { commandManagerStore } from "./manager/store";
import { terminalStore } from "./store";
import "./command-manager.css";

export function CommandManager() {
  const store = commandManagerStore;
  const toaster = createToaster();

  onCleanup(() => toaster.destroy());

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
            <YoButton buttonStyle="normal" tone="accent" onClick={requestClose} disabled={store.ui.saving}>
              取消
            </YoButton>
            <YoButton onClick={() => void save()} loading={store.ui.saving}>
              保存
            </YoButton>
          </>
        }
      >
        <ManagerWorkspace store={store} onContextMenu={openCommandMenu} />
      </YoDialog>
      <YoToaster toaster={toaster} />
    </>
  );
}
