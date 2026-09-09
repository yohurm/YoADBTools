import { describe, expect, it, vi } from "vitest";

import type { CommandDto, CommandGroupDto } from "@yohu/api";

const mocks = vi.hoisted(() => ({
  terminalExec: vi.fn(),
  groupRun: vi.fn(),
  groupCancel: vi.fn(),
}));

vi.mock("@yohu/api", async () => {
  const actual = await vi.importActual<typeof import("@yohu/api")>("@yohu/api");
  return {
    ...actual,
    commandlibLoad: vi.fn(),
    commandlibSave: vi.fn(),
    groupRun: (...a: unknown[]) => mocks.groupRun(...a),
    groupCancel: (...a: unknown[]) => mocks.groupCancel(...a),
    onGroupProgress: vi.fn(() => undefined),
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
  tags: [],
  commands: [{ id: "c0", name: "echo", template: "echo hi" }],
};

function texts(store: ReturnType<typeof createTerminalStore>): string[] {
  return store.lines.map((row) => `${row.kind}:${row.text}`);
}

describe("send / runCommand / runGroup 目标设备", () => {
  it("库命令填充后走 terminal.exec", async () => {
    mocks.terminalExec.mockResolvedValue([
      { serial: "A1", ok: true, message: "", stdout: "ok", duration_ms: 1, exit_code: 0, stderr: "" },
    ]);
    const store = createTerminalStore();
    await store.runCommand(["A1"], COMMAND, ["hi"]);
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
    const store = createTerminalStore();
    await store.runCommand([], COMMAND, ["hi"]);
    await store.runGroup([], GROUP);
    expect(mocks.terminalExec).not.toHaveBeenCalled();
    expect(mocks.groupRun).not.toHaveBeenCalled();
    expect(store.lines.some((row) => row.text === "未选择在线设备")).toBe(true);
  });

  it("命令组把传入 serials 原样交给 groupRun", async () => {
    mocks.groupRun.mockResolvedValue(7);
    const store = createTerminalStore();
    await store.runGroup(["B2"], GROUP);
    expect(mocks.groupRun).toHaveBeenCalledWith({ group_id: "g1", serials: ["B2"] });
  });

  it("含占位符的组不调用 IPC，提示逐条执行", async () => {
    mocks.groupRun.mockClear();
    const store = createTerminalStore();
    await store.runGroup(["B2"], {
      ...GROUP,
      commands: [{ ...COMMAND }],
    });
    expect(mocks.groupRun).not.toHaveBeenCalled();
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

  it("cancelGroup 把 run_id 交给 groupCancel", async () => {
    mocks.groupRun.mockResolvedValue(9);
    mocks.groupCancel.mockResolvedValue(undefined);
    const store = createTerminalStore();
    await store.runGroup(["B2"], GROUP);
    await store.cancelGroup();
    expect(mocks.groupCancel).toHaveBeenCalledWith(9);
  });

  it("clearResults 清空执行结果面板", async () => {
    const store = createTerminalStore();
    await store.runCommand([], COMMAND, ["hi"]);
    expect(store.lines.length).toBeGreaterThan(0);
    store.clearResults();
    expect(store.lines).toEqual([]);
  });
});
