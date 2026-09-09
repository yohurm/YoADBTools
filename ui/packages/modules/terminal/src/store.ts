/**
 * 终端模块 store：命令库 + 统一输入/输出行。
 * 库命令、自定义输入都走 `send` → `terminal.exec`。
 * 执行目标 serials 由壳按 SelectionMode 注入，禁止再扫全部在线设备。
 */

import { createStore } from "solid-js/store";

import {
  COMMAND_LIBRARY_SCHEMA_VERSION,
  commandlibLoad,
  commandlibSave,
  groupCancel,
  groupRun,
  onGroupProgress,
  terminalExec,
  YoLog,
} from "@yohu/api";
import type { CommandDto, CommandGroupDto, CommandLibraryDto } from "@yohu/api";

import {
  combineOutput,
  commandNeedsInput,
  fillTemplate,
  formatAdbLine,
  toExecLine,
} from "./command-line";

export { commandNeedsInput };

export type IoKind = "in" | "out";

/** 一条终端行：输入或输出标识 + 时间 + 内容。 */
export interface IoLine {
  id: number;
  kind: IoKind;
  time: string;
  text: string;
}

let nextId = 1;
let activeGroupRun: number | null = null;

const nowText = (): string => new Date().toLocaleTimeString("zh-CN", { hour12: false });

export function createTerminalStore() {
  let prependAdb = false;
  const [library, setLibrary] = createStore<CommandLibraryDto>({
    schema_version: COMMAND_LIBRARY_SCHEMA_VERSION,
    groups: [],
  });
  const [lines, setLines] = createStore<IoLine[]>([]);

  function setPrependAdb(value: boolean): void {
    prependAdb = value;
  }

  function pushLine(kind: IoKind, text: string): void {
    setLines((rows) => [...rows, { id: nextId++, kind, time: nowText(), text }]);
  }

  function pushOut(text: string): void {
    pushLine("out", text.replace(/\n+$/, ""));
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
        pushOut(combineOutput(row.stdout, row.stderr, row.message));
      }
    } catch (e) {
      YoLog.error("terminal", "发送失败", { command: prepared, error: String(e) });
      pushOut(String(e));
    }
  }

  /** 库命令：填充后走同一条发送。 */
  async function runCommand(serials: string[], command: CommandDto, values: string[]): Promise<void> {
    await send(serials, fillTemplate(command.template, values));
  }

  /** 执行命令组（进度经 group/progress 回流为输入/输出行）。 */
  async function runGroup(serials: string[], group: CommandGroupDto): Promise<void> {
    const needing = group.commands.find((c) => commandNeedsInput(c.template));
    if (needing) {
      pushLine("in", `组: ${group.name}`);
      pushOut(`命令组含需填值的命令（${needing.name}），请逐条执行`);
      return;
    }
    if (serials.length === 0) {
      pushLine("in", `组: ${group.name}`);
      pushOut("未选择在线设备");
      return;
    }
    try {
      activeGroupRun = await groupRun({ group_id: group.id, serials });
    } catch (e) {
      activeGroupRun = null;
      pushLine("in", `组: ${group.name}`);
      pushOut(String(e));
    }
  }

  async function cancelGroup(): Promise<void> {
    const runId = activeGroupRun;
    if (runId === null) return;
    try {
      await groupCancel(runId);
    } finally {
      activeGroupRun = null;
    }
  }

  void onGroupProgress((e) => {
    pushLine("in", formatAdbLine(e.serial, e.template));
    pushOut(e.message ?? "");
  });

  /** 清屏：只清 UI 结果面板（不落盘、不影响命令库）。 */
  function clearResults(): void {
    setLines([]);
  }

  return {
    library,
    lines,
    load,
    save,
    setPrependAdb,
    send,
    runCommand,
    runGroup,
    cancelGroup,
    clearResults,
  };
}

export type TerminalStoreApi = ReturnType<typeof createTerminalStore>;

export const terminalStore = createTerminalStore();
