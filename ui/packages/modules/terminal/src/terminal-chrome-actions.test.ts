import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  terminalChromeActions,
  terminalChromeIsCancel,
  terminalChromeIsClear,
  terminalChromeIsLibrary,
} from "./terminal-chrome-actions";

describe("终端页眉动作", () => {
  it("有在跑的组才有取消，清屏与命令管理常驻", () => {
    expect(terminalChromeActions({ cancellable: false })).toEqual(["clear", "library"]);
    expect(terminalChromeActions({ cancellable: true })).toEqual(["clear", "cancel", "library"]);
  });

  it("取消插在清屏与命令管理之间，顺序稳定", () => {
    const ids = terminalChromeActions({ cancellable: true });
    expect(ids.indexOf("cancel")).toBeGreaterThan(ids.indexOf("clear"));
    expect(ids.indexOf("cancel")).toBeLessThan(ids.indexOf("library"));
  });

  it("清屏、取消、命令管理各判一次", () => {
    expect(terminalChromeIsClear("clear")).toBe(true);
    expect(terminalChromeIsCancel("cancel")).toBe(true);
    expect(terminalChromeIsLibrary("library")).toBe(true);
    expect(terminalChromeIsCancel("clear")).toBe(false);
    expect(terminalChromeIsLibrary("cancel")).toBe(false);
  });
});

describe("终端页眉动作只在页眉模块判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const ids = ["clear", "cancel", "library"];

  it("视图不再比较 id 字面量，也不在 memo 里建节点", () => {
    for (const name of ["terminal-chrome-actions.ts", "TerminalView.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      for (const id of ids) body = body.replaceAll(`return id === "${id}"`, "");
      for (const id of ids) expect(body, name).not.toContain(`id === "${id}"`);
    }
    const view = readFileSync(join(root, "TerminalView.tsx"), "utf8");
    // 节点在 JSX 里现组；memo 只算身份，否则整栏会跟着重建、把 chip 进出冲掉。
    expect(view).toContain("terminalChromeActions({");
    expect(view).not.toMatch(/createMemo\(\(\): YoChromeAction\[\]/);
    expect(view).toContain("chromeActions().map((id) => ({ key: id, node: chromeAction(id) }))");
  });
});
