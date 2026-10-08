/**
 * 终端主视图：树 / 流 / 发送栏。队列与组执行在 store。
 */

import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

import { YoBadge, YoButton, YoChrome, YoPage, YoPanel, YoToaster, createToaster, type YoChromeAction } from "@yohu/ui";
import {
  errorText,
  ModuleTitle,
  YoLog,
  type DeviceSession,
  type LibraryEntryDto,
} from "@yohu/api";

import { CommandManager } from "./CommandManager";
import { ImportDialog } from "./ImportDialog";
import { LibraryPane } from "./LibraryPane";
import { Composer } from "./Composer";
import { ParameterDialog } from "./ParameterDialog";
import { ResultStream } from "./ResultStream";
import { importCommitCount, importCommitSummary } from "./import-selection";
import { importBlockedByManager } from "./import-guard";
import { commandManagerStore } from "./manager/store";
import { terminalStore } from "./store";
import "./terminal.css";

export function TerminalView(props: DeviceSession) {
  const [inputEntry, setInputEntry] = createSignal<LibraryEntryDto | null>(null);
  const [inputOpen, setInputOpen] = createSignal(false);
  const toaster = createToaster();

  function currentEntry(): LibraryEntryDto | null {
    return inputEntry();
  }

  function closeParameter(): void {
    setInputOpen(false);
  }

  const dialogEntry = createMemo<LibraryEntryDto | null>((prev) => currentEntry() ?? prev ?? null);
  const dialogTitle = (): string => dialogEntry()?.name ?? "";

  onCleanup(() => toaster.destroy());

  onMount(() => {
    void terminalStore.load();
  });

  createEffect(() => {
    terminalStore.setPrependAdb(props.settings.terminal_prepend_adb);
  });

  const running = (): boolean => terminalStore.busy();
  const canCancel = (): boolean => terminalStore.session.activeRunId !== null;

  const chromeActions = createMemo((): YoChromeAction[] => {
    const items: YoChromeAction[] = [
      {
        key: "clear",
        node: (
          <YoButton buttonStyle="normal" tone="neutral" onClick={() => terminalStore.clearResults()} disabled={!terminalStore.hasLines()}>
            清屏
          </YoButton>
        ),
      },
    ];
    if (canCancel()) {
      items.push({
        key: "cancel",
        node: (
          <YoButton buttonStyle="normal" tone="neutral" onClick={() => void terminalStore.cancelGroup()}>
            取消
          </YoButton>
        ),
      });
    }
    items.push({
      key: "library",
      node: (
        <YoButton buttonStyle="normal" tone="neutral" onClick={() => commandManagerStore.open(terminalStore.library)}>
          命令管理
        </YoButton>
      ),
    });
    return items;
  });

  const showErrorText = (error: unknown): void => {
    toaster.show(errorText(error), "error");
  };

  const refuseImport = (): boolean => {
    const blocked = importBlockedByManager(commandManagerStore.ui.open);
    if (!blocked) return false;
    toaster.show(blocked, "info");
    return true;
  };

  const beginImport = async (paths: string[]): Promise<void> => {
    if (refuseImport()) return;
    try {
      await terminalStore.previewImport(paths);
    } catch (error) {
      YoLog.error("terminal", "导入预览失败", error);
      showErrorText(error);
    }
  };

  const confirmImport = async (entryIds: string[]): Promise<void> => {
    if (refuseImport()) return;
    const preview = terminalStore.importing.preview;
    const summary = preview
      ? importCommitSummary(preview, new Set(entryIds))
      : { add: entryIds.length, overwrite: 0 };
    try {
      await terminalStore.applyImport(entryIds);
      YoLog.info("terminal", "导入命令", summary);
      toaster.show(`已导入 ${importCommitCount(summary)} 条`, "success");
    } catch (error) {
      YoLog.error("terminal", "导入失败", error);
      showErrorText(error);
    }
  };

  return (
    <YoPage class="yohu-terminal">
      <YoChrome
        title={ModuleTitle.Terminal}
        leading={props.selectedLabel ? <YoBadge text={props.selectedLabel} tone="neutral" /> : undefined}
        actions={chromeActions()}
      />

      <div class="yohu-terminal__body">
        <LibraryPane
          expand={props.settings.terminal_library_expand}
          onImportPaths={(paths) => void beginImport(paths)}
          onNeedValues={(entry) => {
            setInputEntry(entry);
            setInputOpen(true);
          }}
        />

        <YoPanel
          variant="pane"
          padding="none"
          overflow="hidden"
          title="执行结果"
          actions={
            <Show when={running()}>
              <YoBadge text="执行中" tone="warning" />
            </Show>
          }
        >
          <div class="yohu-terminal__stage">
            <ResultStream format={props.settings.terminal_time_format} />
            <Composer serials={props.selectedSerials} />
          </div>
        </YoPanel>
      </div>

      <CommandManager />

      <ImportDialog
        open={terminalStore.importing.open}
        preview={terminalStore.importing.preview}
        onClose={() => terminalStore.closeImport()}
        onConfirm={confirmImport}
      />

      <ParameterDialog
        title={dialogTitle()}
        entry={dialogEntry()}
        open={inputOpen}
        onClose={() => {
          closeParameter();
        }}
        onExitComplete={() => {
          setInputEntry(null);
        }}
        onSubmit={(values) => {
          const entry = currentEntry();
          if (entry) terminalStore.enqueueEntry(entry, values);
          closeParameter();
        }}
      />
      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
