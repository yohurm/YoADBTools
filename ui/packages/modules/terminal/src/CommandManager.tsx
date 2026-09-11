/**
 * 命令管理 Dialog：开窗快照、保存全量提交、打开右键菜单。
 * 草稿与选区在 manager/store；三栏视图各自渲染。
 */

import { Show, createEffect, onCleanup, onMount, untrack } from "solid-js";

import { errorText } from "@yohu/api";
import {
  YoButton,
  YoDialog,
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
import { COMMAND_MANAGER_KEY_BINDINGS, COMMAND_MANAGER_LIST_SELECTOR } from "./manager/keys";
import { createCommandManagerStore } from "./manager/store";
import { terminalStore } from "./store";
import "./command-manager.css";

const toaster = createToaster();

export function CommandManager(props: { open: () => boolean; onClose: () => void }) {
  const store = createCommandManagerStore();
  let root: HTMLDivElement | undefined;

  const openDraft = (): void => {
    store.load(terminalStore.library);
    closeContextMenu();
  };

  onMount(() => {
    if (!root) return;
    const stop = attachPanelKeys(root, {
      listSelector: COMMAND_MANAGER_LIST_SELECTOR,
      bindings: COMMAND_MANAGER_KEY_BINDINGS,
      onAction: (action) => {
        if (action === "select-all") store.selectAllEntries();
      },
    });
    onCleanup(stop);
  });

  createEffect((wasOpen?: boolean) => {
    const open = props.open();
    if (open && !wasOpen) {
      untrack(openDraft);
    }
    if (!open) closeContextMenu();
    return open;
  }, false);

  const close = (): void => {
    closeContextMenu();
    props.onClose();
  };

  const save = async (): Promise<void> => {
    store.setSaving(true);
    store.setError("");
    try {
      await terminalStore.save(store.library());
      close();
    } catch (e) {
      store.setError(typeof e === "string" ? e : JSON.stringify(e));
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
          void navigator.clipboard.writeText(text).catch((e) => {
            toaster.show(`复制失败: ${errorText(e)}`, "error");
          });
        },
        remove: () => store.removeEntries(),
      },
    });
  };

  return (
    <YoDialog
      open={props.open}
      title="命令管理"
      width={960}
      height={560}
      bodyOverflow="hidden"
      bodyPad="none"
      onClose={close}
      footer={
        <>
          <Show when={store.ui.error}>
            <span class="yohu-cm__error">{store.ui.error}</span>
          </Show>
          <YoButton variant="ghost" tone="neutral" onClick={close} disabled={store.ui.saving}>
            取消
          </YoButton>
          <YoButton onClick={() => void save()} loading={store.ui.saving}>
            保存
          </YoButton>
        </>
      }
    >
      <div class="yohu-cm" ref={(el) => { root = el; }}>
        <GroupColumn store={store} />
        <EntryColumn store={store} onContextMenu={openCommandMenu} />
        <EditorColumn store={store} />
      </div>
    </YoDialog>
  );
}
