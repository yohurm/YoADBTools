/**
 * 确认删除对话框：open 独立于名单，出场后再清载荷。
 */

import { createSignal, type Accessor } from "solid-js";

import { YoButton, YoDialog, YoScroller, closeContextMenu } from "@yohu/ui";

import { DeleteConfirm, DeleteExpand, DeleteTargetList } from "./DeleteTargets";
import { DELETE_PREVIEW_LIMIT, canToggleDelete, dropDeleteName } from "./delete-targets";
import { listingStore } from "./listing";

export interface DeleteDialogApi {
  isOpen: Accessor<boolean>;
  ask: (names: string[]) => void;
}

export function DeleteDialog(props: { api?: (api: DeleteDialogApi) => void }) {
  const [deleteOpen, setDeleteOpen] = createSignal(false);
  const [deleteNames, setDeleteNames] = createSignal<string[]>([]);
  const [deleteExpanded, setDeleteExpanded] = createSignal(false);

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

  props.api?.({ isOpen: deleteOpen, ask: askDelete });

  return (
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
          <YoButton buttonStyle="normal" tone="accent" onClick={closeDelete}>
            取消
          </YoButton>
          <YoButton buttonStyle="normal" tone="danger" onClick={confirmDelete}>
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
  );
}
