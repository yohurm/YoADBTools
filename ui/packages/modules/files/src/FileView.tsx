/**
 * 文件管理 View：绑定壳注入的 DeviceSession，对话框与本机选路留在视图层。
 */

import { Show, createEffect, createSignal, onCleanup, onMount, untrack } from "solid-js";

import { onNativeDragDrop, dialogOpenFile, dialogSaveFile, ModuleTitle, YoLog, type DeviceSession } from "@yohu/api";
import {
  YoBadge,
  YoButton,
  YoChrome,
  YoCorner,
  YoDialog,
  YoEmptyState,
  YoIconButton,
  YoPage,
  YoPanel,
  YoScroller,
  YoTextField,
  YoToaster,
  attachPanelKeys,
  closeContextMenu,
  createToaster,
  openContextMenu,
} from "@yohu/ui";

import { DeleteConfirm, DeleteExpand, DeleteTargetList } from "./DeleteTargets";
import { FileTable } from "./FileTable";
import { PreviewPane } from "./PreviewPane";
import { TransferDock } from "./TransferDock";
import { DELETE_PREVIEW_LIMIT, canToggleDelete, dropDeleteName } from "./delete-targets";
import {
  adoptDropSession,
  cssPointFromPhysical,
  destDirFromEntries,
  DROP_IDLE,
  dropCommit,
  dropSessionForEvent,
  dropSessionWithDir,
  localBaseName,
  readFolderTargets,
  readListHitSpace,
  type DropSession,
} from "./drop";
import { controlRowHeight } from "./layout";
import { copyRemotePaths, FILES_KEY_BINDINGS, FILES_LIST_SELECTOR, type FilesKeyAction } from "./keys";
import { filesListMenu } from "./menu";
import { filesFaultText } from "./fault";
import { childPath, validateEntryName } from "./model";
import { AddressSlot, type AddressSlotApi } from "./AddressSlot";
import { listingStore } from "./listing";
import { transferStore } from "./transfers";
import "./files.css";

type CreateKind = "file" | "dir";

export function FileView(props: DeviceSession) {
  const toaster = createToaster();
  onCleanup(() => toaster.destroy());
  const [deleteOpen, setDeleteOpen] = createSignal(false);
  const [deleteNames, setDeleteNames] = createSignal<string[]>([]);
  const [deleteExpanded, setDeleteExpanded] = createSignal(false);
  const [createOpen, setCreateOpen] = createSignal(false);
  const [createKind, setCreateKind] = createSignal<CreateKind | null>(null);
  const [createName, setCreateName] = createSignal("");
  const [createError, setCreateError] = createSignal("");
  const [dropSession, setDropSession] = createSignal<DropSession>(DROP_IDLE);
  let pageEl: HTMLDivElement | undefined;
  let explorerEl: HTMLDivElement | undefined;
  let listEl: HTMLDivElement | undefined;
  let addressSlot: AddressSlotApi | undefined;

  createEffect(() => {
    listingStore.bindSerial(props.selectedSerials[0] ?? null);
  });

  createEffect(() => {
    const tick = listingStore.session.errorTick;
    const text = untrack(() => listingStore.session.error);
    if (tick > 0 && text) toaster.show(text, "error");
  });

  const dropHot = (): boolean => dropSession().hot;

  const dropIntoFolder = (): boolean => props.settings.files_drop_into_folder;

  const dropDirName = (): string | null | undefined => {
    const session = dropSession();
    return session.hot && dropIntoFolder() ? session.dirName : undefined;
  };

  const onNativeDrop = (paths: string[], dirName: string | null): void => {
    if (paths.length === 0) return;
    try {
      const dest = dirName ? childPath(listingStore.session.path, dirName) : listingStore.session.path;
      void transferStore.pushLocals(paths, dest);
    } catch (e) {
      listingStore.notifyError(filesFaultText(e));
    }
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

  const closeDelete = (): void => {
    setDeleteOpen(false);
  };

  const finishDelete = (): void => {
    setDeleteNames([]);
    setDeleteExpanded(false);
  };

  const askDelete = (names: string[]): void => {
    if (names.length === 0) return;
    closeContextMenu();
    setDeleteExpanded(false);
    setDeleteNames(names);
    setDeleteOpen(true);
  };

  const dropFromDelete = (name: string): void => {
    const next = dropDeleteName(deleteNames(), name);
    if (next.length === 0) {
      setDeleteOpen(false);
      return;
    }
    setDeleteNames(next);
    if (next.length <= DELETE_PREVIEW_LIMIT) setDeleteExpanded(false);
  };

  const confirmDelete = (): void => {
    const names = deleteNames();
    setDeleteOpen(false);
    void listingStore.removeMany(names);
  };

  const closeCreate = (): void => {
    setCreateOpen(false);
  };

  const finishCreate = (): void => {
    setCreateKind(null);
    setCreateName("");
    setCreateError("");
  };

  const openCreate = (kind: CreateKind): void => {
    setCreateKind(kind);
    setCreateName(kind === "dir" ? "新建文件夹" : "新建文件.txt");
    setCreateError("");
    setCreateOpen(true);
    closeContextMenu();
  };

  const createReady = (): boolean =>
    validateEntryName(createName().trim()) === null && !listingStore.session.mutating;

  const confirmCreate = (): void => {
    const name = createName().trim();
    const kind = createKind();
    const invalid = validateEntryName(name);
    if (invalid) {
      setCreateError(invalid);
      return;
    }
    setCreateOpen(false);
    if (!kind) return;
    if (kind === "dir") void listingStore.mkdir(name);
    else void listingStore.createFile(name);
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
      askDelete([...listingStore.selection.names]);
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
    let stopDrag: (() => void) | undefined;
    let cancelled = false;
    let destFrame = 0;
    let destPoint = { x: 0, y: 0 };
    const stopDestFrame = (): void => {
      if (destFrame === 0) return;
      cancelAnimationFrame(destFrame);
      destFrame = 0;
    };
    void onNativeDragDrop((event) => {
      const gate = {
        hasDevice: Boolean(props.selectedSerials[0]),
        blocked: deleteOpen() || createOpen(),
      };
      setDropSession((prev) => adoptDropSession(prev, dropSessionForEvent(event, gate)));
      const intoFolder = dropIntoFolder();
      const scale = window.devicePixelRatio;
      if (
        (event.type === "enter" || event.type === "over") &&
        intoFolder &&
        gate.hasDevice &&
        !gate.blocked
      ) {
        destPoint = cssPointFromPhysical(event.position.x, event.position.y, scale);
        if (destFrame === 0) {
          destFrame = requestAnimationFrame(() => {
            destFrame = 0;
            const list = listEl;
            if (!list) return;
            const dirName = destDirFromEntries(
              destPoint.x,
              destPoint.y,
              readListHitSpace(list, controlRowHeight()),
              listingStore.entries,
            );
            setDropSession((prev) => dropSessionWithDir(prev, dirName));
          });
        }
        return;
      }
      if (event.type !== "drop") {
        stopDestFrame();
        return;
      }
      stopDestFrame();
      const commit = dropCommit(event, {
        ...gate,
        intoFolder,
        folders: intoFolder && explorerEl ? readFolderTargets(explorerEl) : [],
        scale,
      });
      if (!commit) {
        YoLog.info("files", "投放未提交", { x: event.position.x, y: event.position.y, paths: event.paths.length });
        return;
      }
      onNativeDrop(commit.paths, commit.dirName);
    }).then(
      (unlisten) => {
        if (cancelled) unlisten();
        else stopDrag = unlisten;
      },
      (error: unknown) => {
        YoLog.error("files", "订阅官方拖放失败", error);
      },
    );
    onCleanup(() => {
      cancelled = true;
      stopDestFrame();
      stopKeys();
      stopDrag?.();
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
        newFile: () => openCreate("file"),
        newDir: () => openCreate("dir"),
        download: () => void onDownload(),
        copy: copySelected,
        remove: () => askDelete([...listingStore.selection.names]),
      },
    });
  };

  return (
    <YoPage class="yohu-files" ref={(el) => { pageEl = el; }}>
      <YoChrome
        title={ModuleTitle.Files}
        leading={props.selectedLabel ? <YoBadge text={props.selectedLabel} tone="neutral" /> : undefined}
        dropIgnore
      >
        <YoButton onClick={() => void onUpload()}>上传</YoButton>
        <YoButton variant="outlined" tone="neutral" disabled={listingStore.singleFile() === undefined} onClick={() => void onDownload()}>
          下载
        </YoButton>
        <YoIconButton
          icon="refresh"
          title="刷新"
          loading={listingStore.session.loading}
          onClick={() => void listingStore.refresh()}
        />
        <YoButton
          variant="ghost" tone="neutral"
          aria-expanded={listingStore.ui.previewOpen}
          onClick={() => listingStore.togglePreview()}
        >
          {listingStore.ui.previewOpen ? "收起预览" : "预览"}
        </YoButton>
      </YoChrome>

      <div
        class="yohu-files__stage yohu-recipe-preview"
        classList={{ "yohu-files__stage--preview-collapsed": !listingStore.ui.previewOpen }}
      >
        <div
          class="yohu-files__explorer"
          data-drop="files"
          ref={(el) => { explorerEl = el; }}
        >
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
        <YoDialog
          open={deleteOpen}
          title="确认删除"
          initial="footer"
          bodyLead={<DeleteConfirm count={deleteNames().length} />}
          bodyTail={
            canToggleDelete(deleteNames()) ? (
              <DeleteExpand
                names={deleteNames()}
                expanded={deleteExpanded()}
                onExpandedChange={setDeleteExpanded}
              />
            ) : undefined
          }
          onClose={closeDelete}
          onExitComplete={finishDelete}
          footer={
            <>
              <YoButton variant="ghost" tone="accent" onClick={closeDelete}>
                取消
              </YoButton>
              <YoButton variant="ghost" tone="danger" onClick={confirmDelete}>
                删除
              </YoButton>
            </>
          }
        >
          <YoScroller>
            <DeleteTargetList
              names={deleteNames()}
              expanded={deleteExpanded()}
              onRemove={dropFromDelete}
            />
          </YoScroller>
        </YoDialog>

        <YoDialog
          open={createOpen}
          title={createKind() === "dir" ? "新建目录" : "新建文件"}
          onClose={closeCreate}
          onExitComplete={finishCreate}
          footer={
            <>
              <YoButton variant="ghost" tone="accent" onClick={closeCreate}>
                取消
              </YoButton>
              <YoButton onClick={confirmCreate} disabled={!createReady()}>
                创建
              </YoButton>
            </>
          }
        >
          <YoScroller>
            <YoTextField
              block
              label="名称"
              value={createName()}
              onInput={(v) => {
                setCreateName(v);
                setCreateError(validateEntryName(v) ?? "");
              }}
              ariaLabel={createKind() === "dir" ? "新目录名" : "新文件名"}
            />
            <Show when={createError()}>
              <YoCorner role="control" class="yohu-files__error" flex="hug" pad="xs">
                {createError()}
              </YoCorner>
            </Show>
          </YoScroller>
        </YoDialog>
      </div>
      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
