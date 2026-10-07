import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommandBlockDto, CommandDto, CommandGroupDto, TaskInfo } from "@yohu/api";

const mocks = vi.hoisted(() => ({
  terminalExec: vi.fn(),
  groupRun: vi.fn(),
  blockRun: vi.fn(),
  groupCancel: vi.fn(),
  commandlibPreview: vi.fn(),
  commandlibApply: vi.fn(),
  progress: [] as Array<(e: { run_id: number; serial: string; template: string; message?: string }) => void>,
  tasks: [] as Array<(e: { tasks: TaskInfo[] }) => void>,
}));

vi.mock("@yohu/api", async () => {
  const actual = await vi.importActual<typeof import("@yohu/api")>("@yohu/api");
  return {
    ...actual,
    commandlibLoad: vi.fn(),
    commandlibSave: vi.fn(),
    commandlibPreview: (...a: unknown[]) => mocks.commandlibPreview(...a),
    commandlibApply: (...a: unknown[]) => mocks.commandlibApply(...a),
    groupRun: (...a: unknown[]) => mocks.groupRun(...a),
    blockRun: (...a: unknown[]) => mocks.blockRun(...a),
    groupCancel: (...a: unknown[]) => mocks.groupCancel(...a),
    onGroupProgress: (h: (e: { run_id: number; serial: string; template: string; message?: string }) => void) => {
      mocks.progress.push(h);
    },
    onTaskSummary: (h: (e: { tasks: TaskInfo[] }) => void) => {
      mocks.tasks.push(h);
    },
    terminalExec: (...a: unknown[]) => mocks.terminalExec(...a),
  };
});

import { isRunFinished } from "./run-wait";
import { createTerminalStore } from "./store";

const COMMAND: CommandDto = {
  id: "c1",
  name: "echo",
  template: "echo {0}",
};

const GROUP: CommandGroupDto = {
  id: "g1",
  name: "demo",
  entries: [{ kind: "command", id: "c0", name: "echo", template: "echo hi" }],
};

const BLOCK: CommandBlockDto = {
  id: "b1",
  name: "连上再看",
  gap_ms: 200,
  steps: [{ template: "wait-for-device" }, { template: "shell getprop ro.product.model" }],
};

function texts(store: ReturnType<typeof createTerminalStore>): string[] {
  return store.lines.map((row) => `${row.kind}:${row.text}`);
}

function emitTasks(tasks: TaskInfo[]): void {
  for (const h of mocks.tasks) h({ tasks });
}

async function finishRun(runId: number): Promise<void> {
  await Promise.resolve();
  emitTasks([{ id: 1, name: "x", active: true, run_id: runId }]);
  emitTasks([{ id: 1, name: "x", active: false, run_id: runId }]);
}

function emitProgress(e: { run_id: number; serial: string; template: string; message?: string }): void {
  for (const h of mocks.progress) h(e);
}

describe("send / 队列 / runGroup 目标设备", () => {
  beforeEach(() => {
    mocks.progress.length = 0;
    mocks.tasks.length = 0;
    mocks.terminalExec.mockReset();
    mocks.groupRun.mockReset();
    mocks.blockRun.mockReset();
    mocks.groupCancel.mockReset();
    mocks.commandlibPreview.mockReset();
    mocks.commandlibApply.mockReset();
  });

  it("库命令填充后入队，sendAll 走 terminal.exec", async () => {
    mocks.terminalExec.mockResolvedValue([
      { serial: "A1", ok: true, message: "", stdout: "ok", duration_ms: 1, exit_code: 0, stderr: "" },
    ]);
    const store = createTerminalStore();
    store.enqueueEntry({ kind: "command", ...COMMAND }, ["hi"]);
    expect(store.session.queue).toHaveLength(1);
    const sending = store.sendAll(["A1"]);
    await sending;
    expect(mocks.terminalExec).toHaveBeenCalledTimes(1);
    expect(mocks.terminalExec).toHaveBeenCalledWith({
      command: "echo hi",
      serials: ["A1"],
    });
    expect(texts(store)).toEqual(["in:adb -s A1 echo hi", "out:ok"]);
  });

  it("空步骤的块不入队，有步骤的块整段入队", () => {
    const store = createTerminalStore();
    store.enqueueEntry({ kind: "block", id: "empty", name: "空", gap_ms: 0, steps: [] }, []);
    expect(store.session.queue).toHaveLength(0);
    store.enqueueEntry(
      { kind: "block", id: "b", name: "两步", gap_ms: 200, steps: [{ template: "echo a" }] },
      ["x"],
    );
    expect(store.session.queue[0]).toMatchObject({ kind: "block", title: "两步", values: ["x"] });
  });

  it("开启 prepend 时发送与展示都带 adb", async () => {
    mocks.terminalExec.mockResolvedValue([
      { serial: "A1", ok: true, message: "", stdout: "list", duration_ms: 1, exit_code: 0, stderr: "" },
    ]);
    const store = createTerminalStore();
    store.setPrependAdb(true);
    await store.send(["A1"], "shell ls");
    expect(mocks.terminalExec).toHaveBeenCalledWith({ command: "adb shell ls", serials: ["A1"] });
    expect(texts(store)).toEqual(["in:adb -s A1 shell ls", "out:list"]);
  });

  it("空目标交给命令边界，输出用领域句", async () => {
    const empty = { code: "invalid_args", message: "未选择在线设备" };
    mocks.terminalExec.mockRejectedValue(empty);
    mocks.groupRun.mockRejectedValue(empty);
    mocks.blockRun.mockRejectedValue(empty);
    const store = createTerminalStore();
    await store.send([], "echo hi");
    await store.runGroup([], GROUP);
    await store.runBlock([], BLOCK, []);
    expect(mocks.terminalExec).toHaveBeenCalledWith({ command: "echo hi", serials: [] });
    expect(mocks.groupRun).toHaveBeenCalledWith({ group_id: "g1", serials: [] });
    expect(mocks.blockRun).toHaveBeenCalledWith({ block_id: "b1", values: [], serials: [] });
    expect(store.lines.filter((row) => row.text === "未选择在线设备")).toHaveLength(3);
  });

  it("命令组把传入 serials 原样交给 groupRun，busy 等到 run_id 终态", async () => {
    mocks.groupRun.mockResolvedValue(7);
    const store = createTerminalStore();
    const running = store.runGroup(["B2"], GROUP);
    await finishRun(7);
    await running;
    expect(mocks.groupRun).toHaveBeenCalledWith({ group_id: "g1", serials: ["B2"] });
    expect(store.session.activeRunId).toBeNull();
    expect(store.session.busy).toBe(false);
  });

  it("含占位符的组仍走 IPC，错误文案由 core 投影", async () => {
    mocks.groupRun.mockRejectedValue({
      code: "invalid_args",
      message: "命令组含需填值的条目 (group=g1, entry=c1)，请逐条执行",
    });
    const store = createTerminalStore();
    await store.runGroup(["B2"], {
      ...GROUP,
      entries: [{ kind: "command", ...COMMAND }],
    });
    expect(mocks.groupRun).toHaveBeenCalledWith({ group_id: "g1", serials: ["B2"] });
    expect(store.lines.some((row) => row.text.includes("请逐条执行"))).toBe(true);
  });

  it("多行输出收成一条 <<<", async () => {
    mocks.terminalExec.mockResolvedValue([
      {
        serial: "A1",
        ok: true,
        message: "",
        stdout: "a\nb\n",
        duration_ms: 1,
        exit_code: 0,
        stderr: "",
      },
    ]);
    const store = createTerminalStore();
    await store.send(["A1"], "shell ls");
    expect(texts(store)).toEqual(["in:adb -s A1 shell ls", "out:a\nb"]);
  });

  it("命令块把 id/values/serials 交给 blockRun，invoke 返回后仍 busy", async () => {
    let released = false;
    mocks.blockRun.mockResolvedValue(8);
    const store = createTerminalStore();
    const running = store.runBlock(["B2"], BLOCK, []);
    await Promise.resolve();
    expect(mocks.blockRun).toHaveBeenCalledWith({ block_id: "b1", values: [], serials: ["B2"] });
    expect(store.session.activeRunId).toBe(8);
    expect(released).toBe(false);
    running.then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    await finishRun(8);
    await running;
    expect(released).toBe(true);
    expect(store.session.activeRunId).toBeNull();
  });

  it("进度计满不结束等待", async () => {
    mocks.blockRun.mockResolvedValue(8);
    const store = createTerminalStore();
    let done = false;
    const running = store.runBlock(["B2"], BLOCK, []).then(() => {
      done = true;
    });
    await Promise.resolve();
    emitProgress({ run_id: 8, serial: "B2", template: "wait-for-device", message: "a" });
    emitProgress({
      run_id: 8,
      serial: "B2",
      template: "shell getprop ro.product.model",
      message: "b",
    });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(store.session.activeRunId).toBe(8);
    emitProgress({ run_id: 8, serial: "B2", template: "echo", message: "" });
    expect(store.lines.some((row) => row.kind === "out" && row.text === "")).toBe(true);
    await finishRun(8);
    await running;
    expect(done).toBe(true);
  });

  it("快照缺任务不结束等待", async () => {
    mocks.groupRun.mockResolvedValue(7);
    const store = createTerminalStore();
    let done = false;
    const running = store.runGroup(["B2"], GROUP).then(() => {
      done = true;
    });
    await Promise.resolve();
    emitTasks([]);
    emitTasks([{ id: 1, name: "命令组: demo", active: false }]);
    await Promise.resolve();
    expect(done).toBe(false);
    expect(store.session.activeRunId).toBe(7);
    await finishRun(7);
    await running;
    expect(done).toBe(true);
  });

  it("cancel 失败不 settle，仍 busy", async () => {
    mocks.groupRun.mockResolvedValue(9);
    mocks.groupCancel.mockRejectedValue({ code: "not_found", message: "运行不存在" });
    const store = createTerminalStore();
    let done = false;
    const running = store.runGroup(["B2"], GROUP).then(() => {
      done = true;
    });
    await Promise.resolve();
    await store.cancelGroup();
    expect(mocks.groupCancel).toHaveBeenCalledWith(9);
    await Promise.resolve();
    expect(done).toBe(false);
    expect(store.session.activeRunId).toBe(9);
    await finishRun(9);
    await running;
    expect(done).toBe(true);
  });

  it("cancelGroup 把当前世代 run_id 交给 groupCancel", async () => {
    mocks.groupRun.mockResolvedValue(9);
    mocks.groupCancel.mockResolvedValue(undefined);
    const store = createTerminalStore();
    const running = store.runGroup(["B2"], GROUP);
    await Promise.resolve();
    await store.cancelGroup();
    expect(mocks.groupCancel).toHaveBeenCalledWith(9);
    expect(store.session.activeRunId).toBe(9);
    await finishRun(9);
    await running;
  });

  it("同名两运行只认 run_id", async () => {
    mocks.groupRun.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const a = createTerminalStore();
    const b = createTerminalStore();
    const runA = a.runGroup(["A"], GROUP);
    const runB = b.runGroup(["B"], GROUP);
    await Promise.resolve();
    expect(a.session.activeRunId).toBe(1);
    expect(b.session.activeRunId).toBe(2);
    emitTasks([
      { id: 10, name: "命令组: demo", active: true, run_id: 1 },
      { id: 20, name: "命令组: demo", active: true, run_id: 2 },
    ]);
    await a.cancelGroup();
    expect(mocks.groupCancel).toHaveBeenCalledWith(1);
    emitTasks([
      { id: 10, name: "命令组: demo", active: false, run_id: 1 },
      { id: 20, name: "命令组: demo", active: true, run_id: 2 },
    ]);
    await runA;
    expect(a.session.activeRunId).toBeNull();
    expect(b.session.activeRunId).toBe(2);
    emitTasks([{ id: 20, name: "命令组: demo", active: false, run_id: 2 }]);
    await runB;
    expect(b.session.activeRunId).toBeNull();
  });

  it("isRunFinished 只要快照有该项且 !active", () => {
    expect(isRunFinished(7, [])).toBe(false);
    expect(isRunFinished(7, [{ id: 1, name: "x", active: false }])).toBe(false);
    expect(isRunFinished(7, [{ id: 1, name: "x", active: true, run_id: 7 }])).toBe(false);
    expect(isRunFinished(7, [{ id: 1, name: "x", active: false, run_id: 7 }])).toBe(true);
  });

  it("clearResults 清空执行结果面板", async () => {
    mocks.terminalExec.mockResolvedValue([
      { serial: "A1", ok: true, message: "", stdout: "ok", duration_ms: 1, exit_code: 0, stderr: "" },
    ]);
    const store = createTerminalStore();
    await store.send(["A1"], "echo hi");
    expect(store.lines.length).toBeGreaterThan(0);
    store.clearResults();
    expect(store.lines).toEqual([]);
  });

  it("IO 行记下墙钟毫秒，不烘焙展示字符串", async () => {
    mocks.terminalExec.mockResolvedValue([
      { serial: "A1", ok: true, message: "", stdout: "ok", duration_ms: 1, exit_code: 0, stderr: "" },
    ]);
    const before = Date.now();
    const store = createTerminalStore();
    await store.send(["A1"], "echo hi");
    const after = Date.now();
    expect(store.lines.length).toBeGreaterThan(0);
    for (const row of store.lines) {
      expect(row.at).toBeGreaterThanOrEqual(before);
      expect(row.at).toBeLessThanOrEqual(after);
      expect(row).not.toHaveProperty("time");
    }
  });

  it("导入预览与提交经 store 换库", async () => {
    mocks.commandlibPreview.mockResolvedValue({
      groups: [{ id: "g1", name: "demo", presence: "new", entries: [] }],
    });
    mocks.commandlibApply.mockResolvedValue({
      schema_version: 3,
      groups: [GROUP],
    });
    const store = createTerminalStore();
    await store.previewImport(["D:/lib.json"]);
    expect(store.importing.open).toBe(true);
    expect(store.importing.paths).toEqual(["D:/lib.json"]);
    expect(mocks.commandlibPreview).toHaveBeenCalledWith(["D:/lib.json"]);
    await store.applyImport(["c0"]);
    expect(mocks.commandlibApply).toHaveBeenCalledWith(["D:/lib.json"], ["c0"]);
    expect(store.importing.open).toBe(false);
    expect(store.importing.preview).toBeNull();
    expect(store.library.groups).toEqual([GROUP]);
  });

  it("stdout 空时用 message，不在 combineOutput 里做 fallback", async () => {
    mocks.terminalExec.mockResolvedValue([
      { serial: "A1", ok: true, message: "done", stdout: "", duration_ms: 1, exit_code: 0, stderr: "" },
    ]);
    const store = createTerminalStore();
    await store.send(["A1"], "shell ls");
    expect(texts(store)).toEqual(["in:adb -s A1 shell ls", "out:done"]);
  });
});

describe("结果、入队和启动失败只各写一处", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(resolve(dir, "store.ts"), "utf8");
  const view = readFileSync(resolve(dir, "TerminalView.tsx"), "utf8");
  const stream = readFileSync(resolve(dir, "ResultStream.tsx"), "utf8");

  it("有没有结果行只在 store", () => {
    expect(src.match(/lines\.length > 0/g)?.length ?? 0).toBe(1);
    expect(view).not.toContain("lines.length > 0");
    expect(stream).not.toContain("lines.length > 0");
  });

  it("入队打开发送栏只写一次", () => {
    expect(src.match(/setSession\("composerOpen", true\)/g)?.length ?? 0).toBe(1);
  });

  it("组块启动失败只记一次", () => {
    expect(src.match(/pushOut\(errorText\(e\)\)/g)?.length ?? 0).toBe(0);
    expect(src.match(/pushOut\(errorText\(error\)\)/g)?.length ?? 0).toBe(1);
  });

  it("发送空白行不看 if (!line)", () => {
    expect(src).not.toContain("if (!line)");
  });

  it("push_error_once", () => {
    const needle = "pushOut(" + "errorText";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("pushError(");
  });

  it("push_adb_in_once", () => {
    const needle = "pushLine(\"in\", " + "formatAdbLine";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("pushAdbIn(");
  });

  it("draft_trimmed_present_once", () => {
    expect(src).not.toContain("trim().length");
    expect(src).toContain("trimmedTextPresent");
    let cursor = dir;
    let index = "";
    for (;;) {
      const candidate = resolve(cursor, "packages/ui/src/index.ts");
      if (existsSync(candidate)) {
        index = readFileSync(candidate, "utf8");
        break;
      }
      const parent = dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    expect(index).toContain("trimmedTextPresent");
  });
});

describe("关上导入预览只写一处", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(resolve(dir, "store.ts"), "utf8");

  it("close_import_once", () => {
    const needle = "setImporting({ open: false" + ", paths: [], preview: null })";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("closeImport(");
  });
});

describe("会话忙碌只读一次", () => {
  it("session_busy_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    const composer = readFileSync(resolve(dir, "Composer.tsx"), "utf8");
    const view = readFileSync(resolve(dir, "TerminalView.tsx"), "utf8");
    const times = (text: string, needle: string) => text.split(needle).length - 1;
    const needle = "session" + ".busy";
    expect(times(src, needle)).toBe(1);
    expect(times(composer, needle)).toBe(0);
    expect(times(view, needle)).toBe(0);
    expect(times(src, "function busy")).toBe(1);
    expect(times(src, "export function busy")).toBe(0);
    expect(composer).toContain("terminalStore.busy()");
    expect(view).toContain("terminalStore.busy()");
  });
});

describe("清掉活动运行只写一次", () => {
  it("clear_active_run_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('setSession("activeRunId", ' + "null)")).toBe(1);
    expect(times("function clearActiveRun")).toBe(1);
    expect(times("export function clearActiveRun")).toBe(0);
    expect(times("clearActiveRun()")).toBe(3);
  });
});

describe("发送日志明细只拼一次", () => {
  it("command_detail_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("{ command: prepared, " + "serials }")).toBe(1);
    expect(times("function commandDetail")).toBe(1);
    expect(times("export function commandDetail")).toBe(0);
    expect(times("commandDetail(prepared, serials)")).toBe(3);
  });
});

describe("日志里的错误原文只取一次", () => {
  it("error_detail_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("errorText(" + "e)")).toBe(1);
    expect(times("function errorDetail")).toBe(1);
    expect(times("export function errorDetail")).toBe(0);
    expect(times("errorDetail(e)")).toBe(2);
  });
});

describe("换上内存库只写一次", () => {
  it("adopt_library_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("setLibrary(" + "dto)")).toBe(1);
    expect(times("function adoptLibrary")).toBe(1);
    expect(times("export function adoptLibrary")).toBe(0);
    expect(times("adoptLibrary(dto)")).toBe(2);
  });
});

describe("没有等待就返回只写一次", () => {
  it("with_wait_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("const current = " + "wait")).toBe(1);
    expect(times("if (!current) " + "return")).toBe(1);
    expect(times("function withWait")).toBe(1);
    expect(times("export function withWait")).toBe(0);
    expect(times("withWait(")).toBe(3);
  });
});

describe("还是这次排空只比一次", () => {
  it("same_drain_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("gen === " + "drainGen")).toBe(1);
    expect(times("gen !== " + "drainGen")).toBe(0);
    expect(times("function sameDrain")).toBe(1);
    expect(times("export function sameDrain")).toBe(0);
    expect(times("sameDrain(gen)")).toBe(2);
  });
});

describe("下一个队列编号只加一次", () => {
  it("next_queued_id_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("nextQueueId" + "++")).toBe(1);
    expect(times("function nextQueuedId")).toBe(1);
    expect(times("export function nextQueuedId")).toBe(0);
    expect(times("nextQueuedId()")).toBe(3);
  });
});

describe("等这次运行结束只写一次", () => {
  it("wait_run_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("await await" + "Run(runId)")).toBe(1);
    expect(times("function waitRun")).toBe(1);
    expect(times("export function waitRun")).toBe(0);
    expect(times("await waitRun(runId)")).toBe(2);
  });
});
