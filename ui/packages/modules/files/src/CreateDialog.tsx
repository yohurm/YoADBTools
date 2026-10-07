/**
 * 新建文件 / 目录对话框：open 独立于 kind，出场后再清载荷。
 */

import { Show, createSignal, type Accessor } from "solid-js";

import { YoButton, YoCorner, YoDialog, YoScroller, YoTextField, closeContextMenu } from "@yohu/ui";

import { listingStore } from "./listing";
import { createKindFieldLabel, createKindSeed, createKindTitle, type CreateKind } from "./create-kind";
import { entryIsDir, validateEntryName } from "@yohu/api";
import { fileColumnHeader } from "./model";

export type { CreateKind };

export interface CreateDialogApi {
  isOpen: Accessor<boolean>;
  open: (kind: CreateKind) => void;
}

export function CreateDialog(props: { api?: (api: CreateDialogApi) => void }) {
  const [createOpen, setCreateOpen] = createSignal(false);
  const [createKind, setCreateKind] = createSignal<CreateKind | null>(null);
  const [createName, setCreateName] = createSignal("");
  const [createError, setCreateError] = createSignal("");

  const clearCreateError = (): void => {
    setCreateError("");
  };

  const closeCreate = (): void => {
    setCreateOpen(false);
  };

  const finishCreate = (): void => {
    setCreateKind(null);
    setCreateName("");
    clearCreateError();
  };

  const openCreate = (kind: CreateKind): void => {
    setCreateKind(kind);
    setCreateName(createKindSeed(kind));
    clearCreateError();
    setCreateOpen(true);
    closeContextMenu();
  };

  const draftName = (): string => createName().trim();

  const createReady = (): boolean =>
    validateEntryName(draftName()) === null && !listingStore.session.mutating;

  const confirmCreate = (): void => {
    const name = draftName();
    const kind = createKind();
    const invalid = validateEntryName(name);
    if (invalid) {
      setCreateError(invalid);
      return;
    }
    closeCreate();
    if (!kind) return;
    if (entryIsDir(kind)) void listingStore.mkdir(name);
    else void listingStore.createFile(name);
  };

  props.api?.({ isOpen: createOpen, open: openCreate });

  return (
    <YoDialog
      open={createOpen}
      title={createKindTitle(createKind() ?? "file")}
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
          label={fileColumnHeader("name")}
          value={createName()}
          onInput={(v) => {
            setCreateName(v);
            setCreateError(validateEntryName(v) ?? "");
          }}
          ariaLabel={createKindFieldLabel(createKind() ?? "file")}
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
