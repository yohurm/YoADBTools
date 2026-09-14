/**
 * 终端主视图：树 / 流 / 发送栏。队列与组执行在 store。
 */

import { Show, createEffect, createSignal, onMount } from "solid-js";

import { YoBadge, YoButton, YoChrome, YoPage, YoPanel } from "@yohu/ui";
import type { DeviceSession, LibraryEntryDto } from "@yohu/api";
import { ModuleTitle } from "@yohu/api";

import { CommandManager } from "./CommandManager";
import { CommandTree } from "./CommandTree";
import { Composer } from "./Composer";
import { ParameterDialog } from "./ParameterDialog";
import { ResultStream } from "./ResultStream";
import { entryParams, entrySlots, entryTemplates } from "./command-line";
import { terminalStore } from "./store";
import "./terminal.css";

export function TerminalView(props: DeviceSession) {
  const [managerOpen, setManagerOpen] = createSignal(false);
  const [inputEntry, setInputEntry] = createSignal<LibraryEntryDto | null>(null);
  const [inputOpen, setInputOpen] = createSignal(false);

  onMount(() => {
    void terminalStore.load();
  });

  createEffect(() => {
    terminalStore.setPrependAdb(props.settings.terminal_prepend_adb);
  });

  const hasLines = (): boolean => terminalStore.lines.length > 0;
  const running = (): boolean => terminalStore.session.busy;
  const canCancel = (): boolean => terminalStore.session.activeRunId !== null;

  return (
    <YoPage class="yohu-terminal">
      <YoChrome title={ModuleTitle.Terminal} deviceLabel={props.selectedLabel ?? undefined}>
        <YoButton variant="outlined" tone="neutral" onClick={() => terminalStore.clearResults()} disabled={!hasLines()}>
          清屏
        </YoButton>
        <Show when={canCancel()}>
          <YoButton variant="outlined" tone="neutral" onClick={() => void terminalStore.cancelGroup()}>
            取消
          </YoButton>
        </Show>
        <YoButton variant="outlined" tone="neutral" onClick={() => setManagerOpen(true)}>
          命令管理
        </YoButton>
      </YoChrome>

      <div class="yohu-terminal__body">
        <YoPanel variant="pane" padding="sm">
          <CommandTree
            onNeedValues={(entry) => {
              setInputEntry(entry);
              setInputOpen(true);
            }}
          />
        </YoPanel>

        <YoPanel
          class="yohu-terminal__output"
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

      <CommandManager open={managerOpen} onClose={() => setManagerOpen(false)} />

      <Show when={inputEntry()}>
        <ParameterDialog
          title={inputEntry()!.name}
          templates={entryTemplates(inputEntry()!)}
          params={entryParams(inputEntry()!)}
          slots={entrySlots(inputEntry()!)}
          open={inputOpen}
          onClose={() => {
            setInputOpen(false);
            setInputEntry(null);
          }}
          onSubmit={(values) => {
            const entry = inputEntry();
            if (entry?.kind === "command") {
              terminalStore.enqueueCommand(entry, values);
            } else if (entry?.kind === "block") {
              terminalStore.enqueueBlock(entry, values);
            }
            setInputEntry(null);
          }}
        />
      </Show>
    </YoPage>
  );
}
