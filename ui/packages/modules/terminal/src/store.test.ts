import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommandBlockDto, CommandDto, CommandGroupDto, TaskInfo } from "@yohu/api";

const mocks = vi.hoisted(() => ({
  terminalExec: vi.fn(),
  groupRun: vi.fn(),
  blockRun: vi.fn(),
  groupCancel: vi.fn(),
  progress: [] as Array<(e: { run_id: number; serial: string; template: string; message?: string }) => void>,
  tasks: [] as Array<(e: { tasks: TaskInfo[] }) => void>,
}));

vi.mock("@yohu/api", async () => {
  const actual = await vi.importActual<typeof import("@yohu/api")>("@yohu/api");
  return {
    ...actual,
    commandlibLoad: vi.fn(),
    commandlibSave: vi.fn(),
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

async function finishTask(name: string): Promise<void> {
  await Promise.resolve();
  const tasks = [
    { id: 1, name, active: true },
    { id: 1, name, active: false },
  ] as const;
  for (const task of tasks) {
    for (const h of mocks.tasks) h({ tasks: [task] });
  }
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
  });

  it("库命令填充后入队，sendAll 走 terminal.exec", async () => {
    mocks.terminalExec.mockResolvedValue([
      { serial: "A1", ok: true, message: "", stdout: "ok", duration_ms: 1, exit_code: 0, stderr: "" },
    ]);
    const store = createTerminalStore();
    store.enqueueCommand(COMMAND, ["hi"]);
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

  it("空目标不调用 IPC，仍记输入输出行", async () => {
    mocks.terminalExec.mockClear();
    mocks.groupRun.mockClear();
    mocks.blockRun.mockClear();
    const store = createTerminalStore();
    await store.send([], "echo hi");
    await store.runGroup([], GROUP);
    await store.runBlock([], BLOCK, []);
    expect(mocks.terminalExec).not.toHaveBeenCalled();
    expect(mocks.groupRun).not.toHaveBeenCalled();
    expect(mocks.blockRun).not.toHaveBeenCalled();
    expect(store.lines.some((row) => row.text === "未选择在线设备")).toBe(true);
  });

  it("命令组把传入 serials 原样交给 groupRun，busy 等到任务终态", async () => {
    mocks.groupRun.mockResolvedValue(7);
    const store = createTerminalStore();
    const running = store.runGroup(["B2"], GROUP);
    await finishTask("命令组: demo");
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

  it("点组入队后 sendAll 才 runGroup", async () => {
    mocks.groupRun.mockResolvedValue(11);
    const store = createTerminalStore();
    store.enqueueGroup(GROUP);
    expect(store.session.queue[0]?.kind).toBe("group");
    const sending = store.sendAll(["B2"]);
    expect(store.session.busy).toBe(true);
    await finishTask("命令组: demo");
    await sending;
    expect(mocks.groupRun).toHaveBeenCalledWith({ group_id: "g1", serials: ["B2"] });
    expect(store.session.busy).toBe(false);
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
    await finishTask("命令块: 连上再看");
    await running;
    expect(released).toBe(true);
    expect(store.session.activeRunId).toBeNull();
  });

  it("进度事件数够了也结束等待", async () => {
    mocks.blockRun.mockResolvedValue(8);
    const store = createTerminalStore();
    const running = store.runBlock(["B2"], BLOCK, []);
    await Promise.resolve();
    emitProgress({ run_id: 8, serial: "B2", template: "wait-for-device", message: "a" });
    emitProgress({
      run_id: 8,
      serial: "B2",
      template: "shell getprop ro.product.model",
      message: "b",
    });
    await running;
    expect(store.session.activeRunId).toBeNull();
  });

  it("cancelGroup 把当前世代 run_id 交给 groupCancel", async () => {
    mocks.groupRun.mockResolvedValue(9);
    mocks.groupCancel.mockResolvedValue(undefined);
    const store = createTerminalStore();
    const running = store.runGroup(["B2"], GROUP);
    await Promise.resolve();
    await store.cancelGroup();
    expect(mocks.groupCancel).toHaveBeenCalledWith(9);
    await finishTask("命令组: demo");
    await running;
  });

  it("两个 store 实例不共用 activeRun 槽", async () => {
    const other: CommandGroupDto = { ...GROUP, id: "g2", name: "other" };
    mocks.groupRun.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const a = createTerminalStore();
    const b = createTerminalStore();
    const runA = a.runGroup(["A"], GROUP);
    const runB = b.runGroup(["B"], other);
    await Promise.resolve();
    expect(a.session.activeRunId).toBe(1);
    expect(b.session.activeRunId).toBe(2);
    for (const h of mocks.tasks) {
      h({
        tasks: [
          { id: 1, name: "命令组: demo", active: true },
          { id: 2, name: "命令组: other", active: true },
        ],
      });
    }
    await a.cancelGroup();
    expect(mocks.groupCancel).toHaveBeenCalledWith(1);
    for (const h of mocks.tasks) {
      h({
        tasks: [
          { id: 1, name: "命令组: demo", active: false },
          { id: 2, name: "命令组: other", active: true },
        ],
      });
    }
    await runA;
    expect(a.session.activeRunId).toBeNull();
    expect(b.session.activeRunId).toBe(2);
    for (const h of mocks.tasks) {
      h({ tasks: [{ id: 2, name: "命令组: other", active: false }] });
    }
    await runB;
    expect(b.session.activeRunId).toBeNull();
  });

  it("clearResults 清空执行结果面板", async () => {
    const store = createTerminalStore();
    await store.send([], "echo hi");
    expect(store.lines.length).toBeGreaterThan(0);
    store.clearResults();
    expect(store.lines).toEqual([]);
  });

  it("IO 行记下墙钟毫秒，不烘焙展示字符串", async () => {
    const before = Date.now();
    const store = createTerminalStore();
    await store.send([], "echo hi");
    const after = Date.now();
    expect(store.lines.length).toBeGreaterThan(0);
    for (const row of store.lines) {
      expect(row.at).toBeGreaterThanOrEqual(before);
      expect(row.at).toBeLessThanOrEqual(after);
      expect(row).not.toHaveProperty("time");
    }
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
