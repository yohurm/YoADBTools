/**
 * 新建文件 / 目录对话框：open 独立于 kind，出场后再清载荷。
 */

import { Show, createSignal, type Accessor } from "solid-js";

import { YoButton, YoCorner, YoDialog, YoScroller, YoTextField, closeContextMenu } from "@yohu/ui";

import { listingStore } from "./listing";
import { validateEntryName } from "./model";

export type CreateKind = "file" | "dir";

export interface CreateDialogApi {
  isOpen: Accessor<boolean>;
  open: (kind: CreateKind) => void;
}

export function CreateDialog(props: { api?: (api: CreateDialogApi) => void }) {
  const [createOpen, setCreateOpen] = createSignal(false);
  const [createKind, setCreateKind] = createSignal<CreateKind | null>(null);
  const [createName, setCreateName] = createSignal("");
  const [createError, setCreateError] = createSignal("");

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

  props.api?.({ isOpen: createOpen, open: openCreate });

  return (
    <YoDialog
      open={createOpen}
      title={createKind() === "dir" ? "新建目录" : "新建文件"}
      onClose={closeCreate}
      onExitComplete={finishCreate}
      footer={
        <>
          <YoButton buttonStyle="normal" tone="accent" onClick={closeCreate}>
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
  );
}
