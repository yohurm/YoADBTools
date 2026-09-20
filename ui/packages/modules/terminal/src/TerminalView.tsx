/**
 * 终端主视图：树 / 流 / 发送栏。队列与组执行在 store。
 */

import { Show, createEffect, createMemo, createSignal, onMount } from "solid-js";

import { YoBadge, YoButton, YoChrome, YoPage, YoPanel, type YoChromeAction } from "@yohu/ui";
import type { DeviceSession, LibraryEntryDto } from "@yohu/api";
import { ModuleTitle } from "@yohu/api";

import { CommandManager } from "./CommandManager";
import { LibraryPane } from "./LibraryPane";
import { Composer } from "./Composer";
import { ParameterDialog } from "./ParameterDialog";
import { ResultStream } from "./ResultStream";
import { commandManagerStore } from "./manager/store";
import { terminalStore } from "./store";
import "./terminal.css";

export function TerminalView(props: DeviceSession) {
  const [inputEntry, setInputEntry] = createSignal<LibraryEntryDto | null>(null);
  const [inputOpen, setInputOpen] = createSignal(false);
  const dialogEntry = createMemo<LibraryEntryDto | null>((prev) => inputEntry() ?? prev ?? null);
  const dialogTitle = (): string => dialogEntry()?.name ?? "";

  onMount(() => {
    void terminalStore.load();
  });

  createEffect(() => {
    terminalStore.setPrependAdb(props.settings.terminal_prepend_adb);
  });

  const hasLines = (): boolean => terminalStore.lines.length > 0;
  const running = (): boolean => terminalStore.session.busy;
  const canCancel = (): boolean => terminalStore.session.activeRunId !== null;

  const chromeActions = createMemo((): YoChromeAction[] => {
    const items: YoChromeAction[] = [
      {
        key: "clear",
        node: (
          <YoButton buttonStyle="normal" tone="neutral" onClick={() => terminalStore.clearResults()} disabled={!hasLines()}>
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

  return (
    <YoPage class="yohu-terminal">
      <YoChrome
        title={ModuleTitle.Terminal}
        leading={props.selectedLabel ? <YoBadge text={props.selectedLabel} tone="neutral" /> : undefined}
        actions={chromeActions()}
      />

      <div class="yohu-terminal__body">
        <LibraryPane
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

      <ParameterDialog
        title={dialogTitle()}
        entry={dialogEntry()}
        open={inputOpen}
        onClose={() => {
          setInputOpen(false);
        }}
        onExitComplete={() => {
          setInputEntry(null);
        }}
        onSubmit={(values) => {
          const entry = inputEntry();
          if (entry?.kind === "command") {
            terminalStore.enqueueCommand(entry, values);
          } else if (entry?.kind === "block") {
            terminalStore.enqueueBlock(entry, values);
          }
          setInputOpen(false);
        }}
      />
    </YoPage>
  );
}
