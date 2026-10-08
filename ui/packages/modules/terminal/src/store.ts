/**
 * 终端运行时 store：命令库、队列、统一输入/输出行。
 * View 只绑事件；发送 / 组 / 块 / 导入编排在本层经 @yohu/api。
 * 块与组 busy 等到 task/summary 中该 run_id 且 !active；进度只画行。
 */

import { createStore } from "solid-js/store";

import {
  blockRun,
  commandlibApply,
  commandlibLoad,
  commandlibPreview,
  commandlibSave,
  entryIsCommand,
  errorText,
  groupCancel,
  groupRun,
  onGroupProgress,
  onTaskSummary,
  terminalExec,
  combineOutput,
  commandBody,
  fillTemplate,
  toExecLine,
  YoLog,
} from "@yohu/api";
import type {
  CommandBlockDto,
  CommandGroupDto,
  CommandLibraryDto,
  ImportPreviewDto,
  LibraryEntryDto,
  TaskInfo,
} from "@yohu/api";
import { trimmedTextPresent } from "@yohu/ui";

import { formatAdbLine, queuedIsLine } from "./command-line";
import { fromDraft } from "./draft";
import { isRunFinished, type RunWait } from "./run-wait";

export type IoKind = "in" | "out";

/** 输入行。标记、字形都认这一把；输出是它的另一面。 */
export function ioLineIsIn(kind: IoKind): boolean {
  return kind === "in";
}

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

  const [library, setLibrary] = createStore<CommandLibraryDto>(fromDraft({ groups: [] }));
  const [lines, setLines] = createStore<IoLine[]>([]);
  const [session, setSession] = createStore({
    queue: [] as QueuedSend[],
    draft: "",
    composerOpen: true,
    busy: false,
    activeRunId: null as number | null,
  });
  const [importing, setImporting] = createStore({
    open: false,
    paths: [] as string[],
    preview: null as ImportPreviewDto | null,
  });

  function setPrependAdb(value: boolean): void {
    prependAdb = value;
  }

  function busy(): boolean {
    return session.busy;
  }

  function clearActiveRun(): void {
    setSession("activeRunId", null);
  }

  function commandDetail(prepared: string, serials: string[]): { command: string; serials: string[] } {
    return { command: prepared, serials };
  }

  function errorDetail(e: unknown): string {
    return errorText(e);
  }

  function adoptLibrary(dto: CommandLibraryDto): void {
    setLibrary(dto);
  }

  function withWait(use: (current: RunWait) => void): void {
    const current = wait;
    if (!current) return;
    use(current);
  }

  function sameDrain(gen: number): boolean {
    return gen === drainGen;
  }

  function nextQueuedId(): number {
    return nextQueueId++;
  }

  async function waitRun(runId: number): Promise<void> {
    await awaitRun(runId);
  }

  function pushLine(kind: IoKind, text: string): void {
    setLines((rows) => [...rows, { id: nextLineId++, kind, at: Date.now(), text }]);
  }

  function pushAdbIn(serial: string, body: string): void {
    pushLine("in", formatAdbLine(serial, body));
  }

  function pushOut(text: string): void {
    pushLine("out", text.replace(/\n+$/, ""));
  }

  function pushError(error: unknown): void {
    pushOut(errorText(error));
  }

  /** 组/块没能启动：清掉活动 run，并记一条输入和一条错误输出。 */
  function failRun(title: string, error: unknown): void {
    clearActiveRun();
    pushLine("in", title);
    pushError(error);
  }

  /** 入队并打开发送栏。自由行和命令块都走这里。 */
  function pushQueued(item: QueuedSend): void {
    setSession("queue", (items) => [...items, item]);
    setSession("composerOpen", true);
  }

  function settleRun(): void {
    withWait((current) => {
      wait = null;
      if (session.activeRunId === current.runId) clearActiveRun();
      current.resolve();
    });
  }

  function considerSettle(): void {
    withWait((current) => {
      if (!isRunFinished(current.runId, lastTasks)) return;
      if (wait?.generation !== current.generation) return;
      settleRun();
    });
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
    adoptLibrary(dto);
  }

  /** 发送一行：先记输入，再 `terminal.exec`，整段输出收成一条 <<<。 */
  async function send(serials: string[], raw: string): Promise<void> {
    const line = raw.trim();
    if (!trimmedTextPresent(line)) return;
    const prepared = toExecLine(line, prependAdb);
    const targets = serials.length > 0 ? serials : ["-"];
    for (const serial of targets) {
      pushAdbIn(serial, line);
    }
    try {
      YoLog.info("terminal", "发送命令", commandDetail(prepared, serials));
      const rows = await terminalExec(commandDetail(prepared, serials));
      YoLog.info("terminal", "命令完成", commandDetail(prepared, serials));
      for (const row of rows) {
        const text = combineOutput(row.stdout, row.stderr);
        pushOut(text.length > 0 ? text : row.message);
      }
    } catch (e) {
      YoLog.error("terminal", "发送失败", { command: prepared, error: errorDetail(e) });
      pushError(e);
    }
  }

  async function runBlockSeq(serials: string[], block: CommandBlockDto, values: string[]): Promise<void> {
    try {
      const runId = await blockRun({ block_id: block.id, values, serials });
      await waitRun(runId);
    } catch (e) {
      failRun(`块: ${block.name}`, e);
    }
  }

  async function runGroup(serials: string[], group: CommandGroupDto): Promise<void> {
    try {
      const runId = await groupRun({ group_id: group.id, serials });
      await waitRun(runId);
    } catch (e) {
      failRun(`组: ${group.name}`, e);
    }
  }

  async function cancelGroup(): Promise<void> {
    drainGen += 1;
    const runId = wait?.runId ?? session.activeRunId;
    if (runId === null) return;
    try {
      await groupCancel(runId);
    } catch (e) {
      YoLog.warn("terminal", "取消失败", { runId, error: errorDetail(e) });
    }
  }

  function enqueueLine(title: string, line: string): void {
    const body = commandBody(line);
    if (!body) return;
    pushQueued({ id: nextQueuedId(), title, kind: "line", line: body });
  }

  function enqueueEntry(entry: LibraryEntryDto, values: string[]): void {
    if (entryIsCommand(entry)) {
      enqueueLine(entry.name, fillTemplate(entry.template, values));
      return;
    }
    if (entry.steps.length === 0) return;
    pushQueued({ id: nextQueuedId(), title: entry.name, kind: "block", block: entry, values });
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

  /** 结果流里有行。清屏按钮和空态都认这一把。 */
  function hasLines(): boolean {
    return lines.length > 0;
  }

  function canSend(): boolean {
    return session.queue.length > 0 || trimmedTextPresent(session.draft);
  }

  async function sendAll(serials: string[]): Promise<void> {
    if (busy() || !canSend()) return;
    const items = session.queue;
    const text = session.draft.trim();
    const gen = ++drainGen;
    setSession("queue", []);
    setSession("draft", "");
    setSession("busy", true);
    try {
      for (const item of items) {
        if (!sameDrain(gen)) break;
        if (queuedIsLine(item)) await send(serials, item.line);
        else await runBlockSeq(serials, item.block, item.values);
      }
      if (sameDrain(gen) && text) await send(serials, text);
    } finally {
      setSession("busy", false);
    }
  }

  void onGroupProgress((e) => {
    pushAdbIn(e.serial, e.template);
    pushOut(e.message);
  });

  void onTaskSummary((e) => {
    lastTasks = e.tasks;
    considerSettle();
  });

  /** 清屏：只清 UI 结果面板（不落盘、不影响命令库）。 */
  function clearResults(): void {
    setLines([]);
  }

  /** 导入预览：路径筛选在领域层。结果留在 importing，对话框只读。 */
  async function previewImport(paths: string[]): Promise<void> {
    const preview = await commandlibPreview(paths);
    setImporting({ open: true, paths, preview });
  }

  /** 导入提交：core 落盘后换内存库，并关上预览会话。 */
  async function applyImport(entryIds: string[]): Promise<void> {
    const dto = await commandlibApply(importing.paths, entryIds);
    adoptLibrary(dto);
    closeImport();
  }

  function closeImport(): void {
    setImporting({ open: false, paths: [], preview: null });
  }

  return {
    library,
    lines,
    session,
    importing,
    load,
    save,
    setPrependAdb,
    send,
    runBlock: runBlockSeq,
    runGroup,
    cancelGroup,
    enqueueEntry,
    removeQueued,
    setDraft,
    setComposerOpen,
    hasLines,
    canSend,
    busy,
    sendAll,
    previewImport,
    applyImport,
    closeImport,
    clearResults,
  };
}

export type TerminalStoreApi = ReturnType<typeof createTerminalStore>;

export const terminalStore = createTerminalStore();
