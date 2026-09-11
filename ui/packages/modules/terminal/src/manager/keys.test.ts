import { describe, expect, it } from "vitest";

import { COMMAND_MANAGER_KEY_BINDINGS, COMMAND_MANAGER_LIST_SELECTOR } from "./keys";

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
});
