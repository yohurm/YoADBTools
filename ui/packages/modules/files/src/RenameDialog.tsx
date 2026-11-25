/**
 * 重命名对话框：open 独立于源名，出场后再清载荷。
 */

import { Show, createSignal, type Accessor } from "solid-js";

import { YoButton, YoCorner, YoDialog, YoScroller, YoTextField, closeContextMenu } from "@yohu/ui";

import { listingStore } from "./listing";
import { fileColumnHeader } from "./model";
import {
  RENAME_FIELD_LABEL,
  RENAME_TITLE,
  renameDraftError,
  renameDraftReady,
  renameTakenPath,
} from "./rename";

export interface RenameDialogApi {
  isOpen: Accessor<boolean>;
  ask: (name: string) => void;
}

export function RenameDialog(props: { api?: (api: RenameDialogApi) => void }) {
  const [renameOpen, setRenameOpen] = createSignal(false);
  const [renameFrom, setRenameFrom] = createSignal("");
  const [renameName, setRenameName] = createSignal("");
  const [renameError, setRenameError] = createSignal("");

  const clearRenameError = (): void => {
    setRenameError("");
  };

  const closeRename = (): void => {
    setRenameOpen(false);
  };

  const finishRename = (): void => {
    setRenameFrom("");
    setRenameName("");
    clearRenameError();
  };

  const draftName = (): string => renameName().trim();

  const takenPath = (): string | null =>
    renameTakenPath(
      listingStore.entries.map((entry) => entry.name),
      listingStore.session.path,
      renameFrom(),
      draftName(),
    );

  const renameReady = (): boolean =>
    renameDraftReady(renameName(), renameFrom(), takenPath()) && !listingStore.session.mutating;

  const askRename = (name: string): void => {
    setRenameFrom(name);
    setRenameName(name);
    clearRenameError();
    setRenameOpen(true);
    closeContextMenu();
  };

  const confirmRename = (): void => {
    const taken = takenPath();
    const invalid = renameDraftError(renameName(), taken);
    if (invalid) {
      setRenameError(invalid);
      return;
    }
    if (!renameDraftReady(renameName(), renameFrom(), taken)) return;
    const from = renameFrom();
    const name = draftName();
    closeRename();
    void listingStore.rename(from, name);
  };

  props.api?.({ isOpen: renameOpen, ask: askRename });

  return (
    <YoDialog
      open={renameOpen}
      title={RENAME_TITLE}
      onClose={closeRename}
      onExitComplete={finishRename}
      footer={
        <>
          <YoButton buttonStyle="normal" tone="accent" onClick={closeRename}>
            取消
          </YoButton>
          <YoButton onClick={confirmRename} disabled={!renameReady()}>
            重命名
          </YoButton>
        </>
      }
    >
      <YoScroller>
        <YoTextField
          block
          label={fileColumnHeader("name")}
          value={renameName()}
          onInput={(v) => {
            setRenameName(v);
            setRenameError(renameDraftError(v, takenPath()) ?? "");
          }}
          ariaLabel={RENAME_FIELD_LABEL}
        />
        <Show when={renameError()}>
          <YoCorner role="control" class="yohu-files__error" flex="hug" pad="xs">
            {renameError()}
          </YoCorner>
        </Show>
      </YoScroller>
    </YoDialog>
  );
}
