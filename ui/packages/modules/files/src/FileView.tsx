/**
 * 文件管理 View：挂载、传 ref、接线 store。拖放会话与对话框自持状态。
 */

import { Show, createEffect, onCleanup, onMount, untrack } from "solid-js";

import { dialogOpenFile, dialogSaveFile, ModuleTitle, type DeviceSession } from "@yohu/api";
import {
  YoBadge,
  YoButton,
  YoChrome,
  YoEmptyState,
  YoIconButton,
  YoPage,
  YoPanel,
  YoToaster,
  attachPanelKeys,
  closeContextMenu,
  createToaster,
  openContextMenu,
} from "@yohu/ui";

import { CreateDialog, type CreateDialogApi } from "./CreateDialog";
import { DeleteDialog, type DeleteDialogApi } from "./DeleteDialog";
import { FileTable } from "./FileTable";
import { PreviewPane } from "./PreviewPane";
import { TransferDock } from "./TransferDock";
import { localBaseName } from "./drop";
import { createDropSession } from "./drop-session";
import { copyRemotePaths, FILES_KEY_BINDINGS, FILES_LIST_SELECTOR, type FilesKeyAction } from "./keys";
import { filesListMenu } from "./menu";
import { filesFaultText } from "./fault";
import { childPath } from "./model";
import { AddressSlot, type AddressSlotApi } from "./AddressSlot";
import { listingStore } from "./listing";
import { transferStore } from "./transfers";
import "./files.css";

export function FileView(props: DeviceSession) {
  const toaster = createToaster();
  onCleanup(() => toaster.destroy());
  let pageEl: HTMLDivElement | undefined;
  let listEl: HTMLDivElement | undefined;
  let listOffset = 0;
  let addressSlot: AddressSlotApi | undefined;
  let deleteDialog: DeleteDialogApi | undefined;
  let createDialog: CreateDialogApi | undefined;

  const drop = createDropSession({
    listEl: () => listEl,
    listOffset: () => listOffset,
    hasDevice: () => Boolean(props.selectedSerials[0]),
    blocked: () => Boolean(deleteDialog?.isOpen() || createDialog?.isOpen()),
    intoFolder: () => props.settings.files_drop_into_folder,
    entries: () => listingStore.entries,
    onCommit: (paths, dirName) => {
      if (paths.length === 0) return;
      try {
        const dest = dirName ? childPath(listingStore.session.path, dirName) : listingStore.session.path;
        void transferStore.pushLocals(paths, dest);
      } catch (e) {
        listingStore.notifyError(filesFaultText(e));
      }
    },
  });

  createEffect(() => {
    listingStore.bindSerial(props.selectedSerials[0] ?? null);
  });

  createEffect(() => {
    const tick = listingStore.session.errorTick;
    const text = untrack(() => listingStore.session.error);
    if (tick > 0 && text) toaster.show(text, "error");
  });

  const dropHot = (): boolean => drop.session().hot;

  const dropDirName = (): string | null | undefined => {
    const session = drop.session();
    return session.hot && props.settings.files_drop_into_folder ? session.dirName : undefined;
  };

  const onUpload = async (): Promise<void> => {
    const selectedPath = await dialogOpenFile({ title: "选择要上传的文件" });
    if (typeof selectedPath === "string") {
      const name = localBaseName(selectedPath) || "upload.bin";
      void transferStore.push(selectedPath, name);
    }
  };

  const onDownload = async (): Promise<void> => {
    const file = listingStore.singleFile();
    if (!file) return;
    const dest = await dialogSaveFile({ defaultPath: file.name, title: "保存到本机" });
    if (typeof dest === "string") void transferStore.pull(file.name, dest, file.size);
  };

  const copySelected = (): void => {
    const names = listingStore.selection.names;
    if (names.length === 0) return;
    const text = copyRemotePaths(listingStore.session.path, names);
    void navigator.clipboard.writeText(text).catch((e) => listingStore.notifyError(filesFaultText(e)));
  };

  const openSelected = (event: KeyboardEvent): void => {
    const names = listingStore.selection.names;
    const focused =
      event.target instanceof Element ? event.target.closest<HTMLElement>("[data-key]")?.dataset.key : undefined;
    const name = names.length === 1 ? names[0] : names.length === 0 ? focused : undefined;
    if (!name) return;
    const entry = listingStore.entries.find((item) => item.name === name);
    if (entry && (entry.kind === "dir" || entry.kind === "symlink")) {
      void listingStore.enterDirectory(name);
    }
  };

  const onKeyAction = (action: FilesKeyAction, event: KeyboardEvent): void => {
    if (action === "select-all") {
      listingStore.selectAll();
      return;
    }
    if (action === "copy") {
      copySelected();
      return;
    }
    if (action === "delete") {
      deleteDialog?.ask([...listingStore.selection.names]);
      return;
    }
    if (action === "refresh") {
      void listingStore.refresh();
      return;
    }
    if (action === "go-up") {
      void listingStore.goUp();
      return;
    }
    if (action === "edit-path") {
      addressSlot?.open();
      return;
    }
    if (action === "open") openSelected(event);
  };

  onMount(() => {
    listingStore.attachView();
    onCleanup(() => listingStore.detachView());
    if (!pageEl) return;
    const stopKeys = attachPanelKeys(pageEl, {
      listSelector: FILES_LIST_SELECTOR,
      bindings: FILES_KEY_BINDINGS,
      onAction: onKeyAction,
    });
    onCleanup(() => {
      stopKeys();
      closeContextMenu();
    });
  });

  const openListMenu = (x: number, y: number): void => {
    const selected = listingStore.selection.names.length > 0;
    openContextMenu(filesListMenu, {
      x,
      y,
      ctx: {
        canDownload: listingStore.singleFile() !== undefined,
        canDelete: selected,
        canCopy: selected,
        newFile: () => createDialog?.open("file"),
        newDir: () => createDialog?.open("dir"),
        download: () => void onDownload(),
        copy: copySelected,
        remove: () => deleteDialog?.ask([...listingStore.selection.names]),
      },
    });
  };

  return (
    <YoPage class="yohu-files" ref={(el) => { pageEl = el; }}>
      <YoChrome
        title={ModuleTitle.Files}
        leading={props.selectedLabel ? <YoBadge text={props.selectedLabel} tone="neutral" /> : undefined}
        dropIgnore
        actions={[
          { key: "upload", node: <YoButton onClick={() => void onUpload()}>上传</YoButton> },
          {
            key: "download",
            node: (
              <YoButton buttonStyle="normal" tone="neutral" disabled={listingStore.singleFile() === undefined} onClick={() => void onDownload()}>
                下载
              </YoButton>
            ),
          },
          {
            key: "refresh",
            node: (
              <YoIconButton
                icon="refresh"
                title="刷新"
                loading={listingStore.session.loading}
                onClick={() => void listingStore.refresh()}
              />
            ),
          },
          {
            key: "preview",
            node: (
              <YoButton
                buttonStyle="normal" tone="neutral"
                aria-expanded={listingStore.ui.previewOpen}
                onClick={() => listingStore.togglePreview()}
              >
                {listingStore.ui.previewOpen ? "收起预览" : "预览"}
              </YoButton>
            ),
          },
        ]}
      />

      <div
        class="yohu-files__stage yohu-recipe-preview"
        classList={{ "yohu-files__stage--preview-collapsed": !listingStore.ui.previewOpen }}
      >
        <div class="yohu-files__explorer" data-drop="files">
          <YoPanel
            variant="pane"
            overflow="hidden"
            edge={dropHot() ? "drop" : undefined}
            header={<AddressSlot api={(slot) => { addressSlot = slot; }} />}
          >
            <Show
              when={props.selectedSerials[0]}
              fallback={<YoEmptyState fill icon="folder" title="未选择设备" description="请在左侧设备栏选择在线设备" />}
            >
              <FileTable
                dropDirName={dropDirName()}
                listRef={(el) => { listEl = el; }}
                onOffset={(block) => { listOffset = block; }}
                onContextMenu={openListMenu}
              />
            </Show>
          </YoPanel>
        </div>
        <div class="yohu-files__preview-slot" data-drop="ignore" inert={!listingStore.ui.previewOpen ? true : undefined}>
          <PreviewPane />
        </div>
      </div>
      <div class="yohu-files__transfer-slot" data-drop="ignore">
        <TransferDock />
      </div>

      <div data-drop="ignore">
        <DeleteDialog api={(api) => { deleteDialog = api; }} />
        <CreateDialog api={(api) => { createDialog = api; }} />
      </div>
      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
