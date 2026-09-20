/**
 * 终端运行时 store：命令库、队列、统一输入/输出行。
 * View 只绑事件；发送 / 组 / 块编排在本层经 @yohu/api。
 * 块与组 busy 等到 task/summary 中该 run_id 且 !active；进度只画行。
 */

import { createStore } from "solid-js/store";

import {
  COMMAND_LIBRARY_SCHEMA_VERSION,
  blockRun,
  commandlibLoad,
  commandlibSave,
  errorText,
  groupCancel,
  groupRun,
  onGroupProgress,
  onTaskSummary,
  terminalExec,
  YoLog,
} from "@yohu/api";
import type {
  CommandBlockDto,
  CommandDto,
  CommandGroupDto,
  CommandLibraryDto,
  TaskInfo,
} from "@yohu/api";

import {
  combineOutput,
  commandBody,
  fillTemplate,
  formatAdbLine,
  toExecLine,
} from "./command-line";
import { isRunFinished, type RunWait } from "./run-wait";

export type IoKind = "in" | "out";

/** 一条终端行：输入或输出标识 + 墙钟毫秒 + 内容。展示形状由设置投影。 */
export interface IoLine {
  id: number;
  kind: IoKind;
  at: number;
  text: string;
}

export type QueuedSend =
  | { id: number; title: string; kind: "line"; line: string }
  | { id: number; title: string; kind: "block"; block: CommandBlockDto; values: string[] };

export function createTerminalStore() {
  let prependAdb = false;
  let nextLineId = 1;
  let nextQueueId = 1;
  let generation = 0;
  let drainGen = 0;
  let lastTasks: TaskInfo[] = [];
  let wait: RunWait | null = null;

  const [library, setLibrary] = createStore<CommandLibraryDto>({
    schema_version: COMMAND_LIBRARY_SCHEMA_VERSION,
    groups: [],
  });
  const [lines, setLines] = createStore<IoLine[]>([]);
  const [session, setSession] = createStore({
    queue: [] as QueuedSend[],
    draft: "",
    composerOpen: true,
    busy: false,
    activeRunId: null as number | null,
  });

  function setPrependAdb(value: boolean): void {
    prependAdb = value;
  }

  function pushLine(kind: IoKind, text: string): void {
    setLines((rows) => [...rows, { id: nextLineId++, kind, at: Date.now(), text }]);
  }

  function pushOut(text: string): void {
    pushLine("out", text.replace(/\n+$/, ""));
  }

  function settleRun(): void {
    const current = wait;
    if (!current) return;
    wait = null;
    if (session.activeRunId === current.runId) setSession("activeRunId", null);
    current.resolve();
  }

  function considerSettle(): void {
    const current = wait;
    if (!current) return;
    if (!isRunFinished(current.runId, lastTasks)) return;
    if (wait?.generation !== current.generation) return;
    settleRun();
  }

  function awaitRun(runId: number): Promise<void> {
    const gen = ++generation;
    return new Promise((resolve) => {
      wait = {
        generation: gen,
        runId,
        resolve,
      };
      setSession("activeRunId", runId);
      considerSettle();
    });
  }

  async function load(): Promise<void> {
    setLibrary(await commandlibLoad());
  }

  /** 全量提交（校验在 core；取消零污染由编辑方深拷贝保证）。 */
  async function save(dto: CommandLibraryDto): Promise<void> {
    await commandlibSave(dto);
    setLibrary(dto);
  }

  /** 发送一行：先记输入，再 `terminal.exec`，整段输出收成一条 <<<。 */
  async function send(serials: string[], raw: string): Promise<void> {
    const line = raw.trim();
    if (!line) return;
    const prepared = toExecLine(line, prependAdb);
    const targets = serials.length > 0 ? serials : ["-"];
    for (const serial of targets) {
      pushLine("in", formatAdbLine(serial, line));
    }
    if (serials.length === 0) {
      pushOut("未选择在线设备");
      return;
    }
    try {
      YoLog.info("terminal", "发送命令", { command: prepared, serials });
      const rows = await terminalExec({ command: prepared, serials });
      YoLog.info("terminal", "命令完成", { command: prepared, serials });
      for (const row of rows) {
        const text = combineOutput(row.stdout, row.stderr);
        pushOut(text.length > 0 ? text : row.message);
      }
    } catch (e) {
      YoLog.error("terminal", "发送失败", { command: prepared, error: errorText(e) });
      pushOut(errorText(e));
    }
  }

  async function runBlockSeq(serials: string[], block: CommandBlockDto, values: string[]): Promise<void> {
    if (serials.length === 0) {
      pushLine("in", `块: ${block.name}`);
      pushOut("未选择在线设备");
      return;
    }
    try {
      const runId = await blockRun({ block_id: block.id, values, serials });
      await awaitRun(runId);
    } catch (e) {
      setSession("activeRunId", null);
      pushLine("in", `块: ${block.name}`);
      pushOut(errorText(e));
    }
  }

  async function runGroup(serials: string[], group: CommandGroupDto): Promise<void> {
    if (serials.length === 0) {
      pushLine("in", `组: ${group.name}`);
      pushOut("未选择在线设备");
      return;
    }
    try {
      const runId = await groupRun({ group_id: group.id, serials });
      await awaitRun(runId);
    } catch (e) {
      setSession("activeRunId", null);
      pushLine("in", `组: ${group.name}`);
      pushOut(errorText(e));
    }
  }

  async function cancelGroup(): Promise<void> {
    drainGen += 1;
    const runId = wait?.runId ?? session.activeRunId;
    if (runId === null) return;
    try {
      await groupCancel(runId);
    } catch (e) {
      YoLog.warn("terminal", "取消失败", { runId, error: errorText(e) });
    }
  }

  function enqueueLine(title: string, line: string): void {
    const body = commandBody(line);
    if (!body) return;
    setSession("queue", (items) => [...items, { id: nextQueueId++, title, kind: "line", line: body }]);
    setSession("composerOpen", true);
  }

  function enqueueCommand(command: CommandDto, values: string[]): void {
    enqueueLine(command.name, fillTemplate(command.template, values));
  }

  function enqueueBlock(block: CommandBlockDto, values: string[]): void {
    if (block.steps.length === 0) return;
    setSession("queue", (items) => [...items, { id: nextQueueId++, title: block.name, kind: "block", block, values }]);
    setSession("composerOpen", true);
  }

  function removeQueued(id: number): void {
    setSession("queue", (items) => items.filter((item) => item.id !== id));
  }

  function setDraft(value: string): void {
    setSession("draft", value);
  }

  function setComposerOpen(open: boolean): void {
    setSession("composerOpen", open);
  }

  function canSend(): boolean {
    return session.queue.length > 0 || session.draft.trim().length > 0;
  }

  async function sendAll(serials: string[]): Promise<void> {
    if (session.busy || !canSend()) return;
    const items = session.queue;
    const text = session.draft.trim();
    const gen = ++drainGen;
    setSession("queue", []);
    setSession("draft", "");
    setSession("busy", true);
    try {
      for (const item of items) {
        if (gen !== drainGen) break;
        if (item.kind === "line") await send(serials, item.line);
        else await runBlockSeq(serials, item.block, item.values);
      }
      if (gen === drainGen && text) await send(serials, text);
    } finally {
      setSession("busy", false);
    }
  }

  void onGroupProgress((e) => {
    pushLine("in", formatAdbLine(e.serial, e.template));
    pushOut(e.message ?? "");
  });

  void onTaskSummary((e) => {
    lastTasks = e.tasks;
    considerSettle();
  });

  /** 清屏：只清 UI 结果面板（不落盘、不影响命令库）。 */
  function clearResults(): void {
    setLines([]);
  }

  return {
    library,
    lines,
    session,
    load,
    save,
    setPrependAdb,
    send,
    runBlock: runBlockSeq,
    runGroup,
    cancelGroup,
    enqueueLine,
    enqueueCommand,
    enqueueBlock,
    removeQueued,
    setDraft,
    setComposerOpen,
    canSend,
    sendAll,
    clearResults,
  };
}

export type TerminalStoreApi = ReturnType<typeof createTerminalStore>;

export const terminalStore = createTerminalStore();
