import { describe, expect, it, vi } from "vitest";

import { terminalCommandMenu } from "./menu";

describe("terminalCommandMenu", () => {
  it("单一命令两项：复制 / 删除；空命令禁用复制", () => {
    const items = terminalCommandMenu.items({
      canCopy: false,
      copy: () => undefined,
      remove: () => undefined,
    });
    expect(items.map((item) => item.id)).toEqual(["copy", "delete"]);
    expect(items.find((item) => item.id === "copy")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "delete")?.danger).toBe(true);
  });

  it("onSelect 分发给对应 ctx 动作", () => {
    const copy = vi.fn();
    const remove = vi.fn();
    terminalCommandMenu.onSelect("copy", { canCopy: true, copy, remove });
    expect(copy).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    terminalCommandMenu.onSelect("delete", { canCopy: true, copy, remove });
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
