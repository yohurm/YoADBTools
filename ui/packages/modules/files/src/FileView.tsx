/**
 * 文件管理 View：挂载、传 ref、接线 store。拖放会话与对话框自持状态。
 */

import { Show, createEffect, onCleanup, onMount, untrack } from "solid-js";

import { writeClipboard, clipboardFailureText, boundSerial, DEVICE_UNSELECTED, dialogFailureText, dialogOpenFile, dialogPickAccepted, dialogSaveFile, hostBaseName, ModuleTitle, type DeviceSession, type DialogPick } from "@yohu/api";
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
  closedAttr,
  createToaster,
  openContextMenu,
  panelHotEdge,
  type YoAddressFieldApi,
} from "@yohu/ui";

import { CreateDialog, type CreateDialogApi } from "./CreateDialog";
import { DeleteDialog, type DeleteDialogApi } from "./DeleteDialog";
import { FileTable } from "./FileTable";
import { PreviewPane } from "./PreviewPane";
import { TransferToasts } from "./TransferToasts";
import { createDropSession } from "./drop-session";
import {
  copyRemotePaths,
  FILES_KEY_BINDINGS,
  FILES_LIST_SELECTOR,
  filesKeyIsCopy,
  filesKeyIsDelete,
  filesKeyIsEditPath,
  filesKeyIsGoUp,
  filesKeyIsOpen,
  filesKeyIsRefresh,
  filesKeyIsSelectAll,
  type FilesKeyAction,
} from "./keys";
import { filesListMenu } from "./menu";
import { previewToggleLabel } from "./preview-label";
import { childPath } from "./model";
import { AddressSlot } from "./AddressSlot";
import { listingStore } from "./listing";
import { transferStore } from "./transfers";
import "./files.css";

export function FileView(props: DeviceSession) {
  const toaster = createToaster();
  onCleanup(() => toaster.destroy());
  let pageEl: HTMLDivElement | undefined;
  let listEl: HTMLDivElement | undefined;
  let listOffset = 0;
  let addressSlot: YoAddressFieldApi | undefined;
  let deleteDialog: DeleteDialogApi | undefined;
  let createDialog: CreateDialogApi | undefined;

  const focusedSerial = (): string | null => boundSerial(props.selectedSerials);
  const singleListedFile = (): ReturnType<typeof listingStore.singleFile> => listingStore.singleFile();
  const previewShown = (): boolean => listingStore.ui.previewOpen;
  const showFailure = (failure: string | undefined): void => {
    if (failure) toaster.show(failure, "error");
  };
  const hostPathAbsent = (path: string | undefined): path is undefined | "" => !path;

  const drop = createDropSession({
    listEl: () => listEl,
    listOffset: () => listOffset,
    hasDevice: () => Boolean(focusedSerial()),
    blocked: () => Boolean(deleteDialog?.isOpen() || createDialog?.isOpen()),
    intoFolder: () => props.settings.files_drop_into_folder,
    entries: () => listingStore.entries,
    onCommit: (paths, dirName) => {
      if (!dirName) {
        void transferStore.pushLocals(paths);
        return;
      }
      const dest = childPath(listingStore.session.path, dirName);
      if (!dest.ok) {
        listingStore.notifyError(dest.reason);
        return;
      }
      void transferStore.pushLocals(paths, dest.path);
    },
  });

  createEffect(() => {
    listingStore.bindSerial(focusedSerial());
  });

  createEffect(() => {
    const tick = listingStore.session.errorTick;
    const text = untrack(() => listingStore.session.error);
    if (tick > 0 && text) toaster.show(text, "error");
  });

  const dropHot = (): boolean => drop.session().hot;

  const dropDirName = (): string | null | undefined => {
    const session = drop.session();
    return session.hot ? session.dirName : undefined;
  };

  const hostPathFromPick = (pick: DialogPick): string | undefined => {
    const failure = dialogFailureText(pick);
    showFailure(failure);
    if (!dialogPickAccepted(pick)) return undefined;
    return pick.path;
  };

  const onUpload = async (): Promise<void> => {
    const path = hostPathFromPick(await dialogOpenFile({ title: "选择要上传的文件" }));
    if (hostPathAbsent(path)) return;
    const name = hostBaseName(path) || "upload.bin";
    void transferStore.push(path, name);
  };

  const onDownload = async (): Promise<void> => {
    const file = singleListedFile();
    if (!file) return;
    const path = hostPathFromPick(await dialogSaveFile({ defaultPath: file.name, title: "保存到本机" }));
    if (hostPathAbsent(path)) return;
    void transferStore.pull(file.name, path, file.size);
  };

  const startDownload = (): void => {
    void onDownload();
  };

  const copySelected = (): void => {
    const names = listingStore.selectionNames();
    if (names.length === 0) return;
    const text = copyRemotePaths(listingStore.session.path, names);
    void writeClipboard(text).then((result) => {
      const failure = clipboardFailureText(result);
      showFailure(failure);
    });
  };

  const openSelected = (event: KeyboardEvent): void => {
    const names = listingStore.selectionNames();
    const focused =
      event.target instanceof Element ? event.target.closest<HTMLElement>("[data-key]")?.dataset.key : undefined;
    const name = names.length === 1 ? names[0] : names.length === 0 ? focused : undefined;
    if (!name) return;
    void listingStore.enterDirectory(name);
  };

  const askDeleteSelection = (): void => {
    deleteDialog?.ask([...listingStore.selectionNames()]);
  };

  const refreshListing = (): void => {
    void listingStore.refresh();
  };

  const onKeyAction = (action: FilesKeyAction, event: KeyboardEvent): void => {
    if (filesKeyIsSelectAll(action)) {
      listingStore.selectAll();
      return;
    }
    if (filesKeyIsCopy(action)) {
      copySelected();
      return;
    }
    if (filesKeyIsDelete(action)) {
      askDeleteSelection();
      return;
    }
    if (filesKeyIsRefresh(action)) {
      refreshListing();
      return;
    }
    if (filesKeyIsGoUp(action)) {
      void listingStore.goUp();
      return;
    }
    if (filesKeyIsEditPath(action)) {
      addressSlot?.open();
      return;
    }
    if (filesKeyIsOpen(action)) openSelected(event);
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
    const selected = listingStore.selectionNames().length > 0;
    openContextMenu(filesListMenu, {
      x,
      y,
      ctx: {
        canDownload: singleListedFile() !== undefined,
        canDelete: selected,
        canCopy: selected,
        newFile: () => createDialog?.open("file"),
        newDir: () => createDialog?.open("dir"),
        download: startDownload,
        copy: copySelected,
        remove: () => askDeleteSelection(),
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
              <YoButton buttonStyle="normal" tone="neutral" disabled={singleListedFile() === undefined} onClick={startDownload}>
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
                onClick={() => refreshListing()}
              />
            ),
          },
          {
            key: "preview",
            node: (
              <YoButton
                buttonStyle="normal" tone="neutral"
                aria-expanded={previewShown()}
                onClick={() => listingStore.togglePreview()}
              >
                {previewToggleLabel(previewShown())}
              </YoButton>
            ),
          },
        ]}
      />

      <div
        class="yohu-files__stage yohu-recipe-preview"
        classList={{ "yohu-files__stage--preview-collapsed": !previewShown() }}
      >
        <div class="yohu-files__explorer" data-drop="files">
          <YoPanel
            variant="pane"
            overflow="hidden"
            role="ops"
            edge={panelHotEdge(dropHot())}
            header={<AddressSlot api={(slot) => { addressSlot = slot; }} />}
          >
            <Show
              when={focusedSerial()}
              fallback={<YoEmptyState fill icon="folder" title={DEVICE_UNSELECTED} description="请在左侧设备栏选择在线设备" />}
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
        <div class="yohu-files__preview-slot" data-drop="ignore" inert={closedAttr(previewShown())}>
          <PreviewPane />
        </div>
      </div>
      <div data-drop="ignore">
        <DeleteDialog api={(api) => { deleteDialog = api; }} />
        <CreateDialog api={(api) => { createDialog = api; }} />
      </div>
      <TransferToasts toaster={toaster} />
      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
