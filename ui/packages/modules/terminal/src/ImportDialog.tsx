/**
 * 导入复核单。
 * 钉住：范围（文件里有什么）、决策行（全选 + 将新增/覆盖）。
 * 滚动：按组。组名贴条数，行尾才是「已在库中」；条目缩进一列勾选。
 * 组行不套 YoSubheader，避免标题和复选框各说一遍名字。
 * 半选不进复选框。条目才提交。
 */

import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

import { importAlreadyPresent, type ImportPresence, type ImportPreviewDto } from "@yohu/api";
import { YoBadge, YoButton, YoCheckbox, YoDialog, YoScroller, resolveDialogOpen, type YoDialogProps } from "@yohu/ui";

import { importDialogSize } from "./layout";

function importDialogBox(): { width: number; height: number } {
  return importDialogSize();
}
import { libraryEntryIcon } from "./command-line";
import {
  defaultSelected,
  importCommitSummary,
  importCommitText,
  importConfirmLabel,
  importGroupHasEntries,
  importPreviewHasEntries,
  IMPORT_ALREADY_IN_LIBRARY,
  importOverviewText,
  isAllChecked,
  isGroupChecked,
  toggleAll,
  toggleEntry,
  toggleGroup,
} from "./import-selection";

function AlreadyInLibrary(props: { presence: ImportPresence }) {
  return (
    <Show when={importAlreadyPresent(props.presence)}>
      <span class="yohu-terminal__import-status">
        <YoBadge text={IMPORT_ALREADY_IN_LIBRARY} tone="warning" />
      </span>
    </Show>
  );
}

export function ImportDialog(props: {
  open: YoDialogProps["open"];
  preview: ImportPreviewDto | null;
  onClose: () => void;
  onConfirm: (entryIds: string[]) => Promise<void>;
}) {
  const box = importDialogBox();
  const [selected, setSelected] = createSignal<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = createSignal(false);
  const preview = createMemo(() => props.preview);

  function clearBusy(): void {
    setBusy(false);
  }

  createEffect((wasOpen?: boolean) => {
    const now = resolveDialogOpen(props.open);
    if (!wasOpen && now) {
      const current = preview();
      setSelected(current ? defaultSelected(current) : new Set<string>());
      clearBusy();
    }
    return now;
  });

  const allChecked = (): boolean => {
    const current = preview();
    return current ? isAllChecked(current, selected()) : false;
  };

  const confirm = async (): Promise<void> => {
    if (busy() || selected().size === 0) return;
    setBusy(true);
    try {
      await props.onConfirm([...selected()]);
    } finally {
      clearBusy();
    }
  };

  return (
    <YoDialog
      open={props.open}
      title="导入命令"
      width={box.width}
      height={box.height}
      onClose={props.onClose}
      bodyLead={
        <Show when={preview()}>
          {(current) => (
            <div class="yohu-terminal__import-lead">
              <p class="yohu-terminal__import-scope">{importOverviewText(current())}</p>
              <div class="yohu-terminal__import-decision">
                <YoCheckbox
                  label="全选"
                  checked={allChecked()}
                  disabled={!importPreviewHasEntries(current()) || busy()}
                  onChange={(on) => setSelected(toggleAll(current(), on))}
                />
                <p class="yohu-terminal__import-effect">{importCommitText(current(), selected())}</p>
              </div>
            </div>
          )}
        </Show>
      }
      footer={
        <>
          <YoButton buttonStyle="normal" tone="accent" disabled={busy()} onClick={props.onClose}>
            取消
          </YoButton>
          <YoButton disabled={selected().size === 0 || busy()} onClick={() => void confirm()}>
            {importConfirmLabel(importCommitSummary(preview() ?? { groups: [] }, selected()))}
          </YoButton>
        </>
      }
    >
      <YoScroller>
        <Show when={preview()}>
          {(current) => (
            <div class="yohu-terminal__import-catalog">
              <For each={current().groups}>
                {(group) => (
                  <section class="yohu-terminal__import-section">
                    <div class="yohu-terminal__import-row" data-role="section">
                      <YoCheckbox
                        tone="section"
                        label={group.name}
                        checked={isGroupChecked(group, selected())}
                        disabled={busy() || !importGroupHasEntries(group)}
                        onChange={(on) => setSelected(toggleGroup(group, selected(), on))}
                      />
                      <span class="yohu-terminal__import-count">{group.entries.length}</span>
                      <AlreadyInLibrary presence={group.presence} />
                    </div>
                    <For each={group.entries}>
                      {(entry) => (
                        <div class="yohu-terminal__import-row" data-role="entry">
                          <YoCheckbox
                            block
                            icon={libraryEntryIcon(entry.kind)}
                            label={entry.name}
                            checked={selected().has(entry.id)}
                            disabled={busy()}
                            onChange={(on) => setSelected(toggleEntry(selected(), entry.id, on))}
                          />
                          <AlreadyInLibrary presence={entry.presence} />
                        </div>
                      )}
                    </For>
                  </section>
                )}
              </For>
            </div>
          )}
        </Show>
      </YoScroller>
    </YoDialog>
  );
}
