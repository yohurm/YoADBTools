import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { COMMAND_MANAGER_KEY_BINDINGS, COMMAND_MANAGER_LIST_SELECTOR, commandManagerKeyIsSelectAll } from "./keys";

describe("命令管理快捷键", () => {
  it("清单内 Ctrl+A 全选；输入框不触发", () => {
    expect(COMMAND_MANAGER_LIST_SELECTOR).toBe(".yohu-cm__list");
    expect(COMMAND_MANAGER_KEY_BINDINGS.map((item) => item.action)).toEqual(["select-all"]);
    const [binding] = COMMAND_MANAGER_KEY_BINDINGS;
    expect(binding?.when({
      inPanel: true,
      inList: true,
      inEditable: false,
      inDialog: true,
      inShell: false,
      inActionable: false,
    })).toBe(true);
    expect(binding?.when({
      inPanel: true,
      inList: true,
      inEditable: true,
      inDialog: true,
      inShell: false,
      inActionable: false,
    })).toBe(false);
  });

  it("全选只判一次", () => {
    expect(commandManagerKeyIsSelectAll("select-all")).toBe(true);
  });
});

describe("命令管理快捷键只在 keys 判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("工作区不再比较 select-all", () => {
    for (const name of ["keys.ts", "Workspace.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      body = body.replaceAll('return action === "select-all"', "");
      expect(body, name).not.toContain('action === "select-all"');
    }
  });
});
