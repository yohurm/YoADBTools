import { describe, expect, it, vi } from "vitest";

import { terminalCommandMenu } from "./menu";

describe("terminalCommandMenu", () => {
  it("单一命令两项：复制 / 删除；空命令禁用复制", () => {
    const items = terminalCommandMenu.items({
      canCopy: false,
      destinations: [],
      copy: () => undefined,
      remove: () => undefined,
      moveTo: () => undefined,
    });
    expect(items.map((item) => item.id)).toEqual(["copy", "delete"]);
    expect(items.find((item) => item.id === "copy")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "delete")?.danger).toBe(true);
  });

  it("有其他组时插入移到，点选只调用 moveTo", () => {
    const moveTo = vi.fn();
    const items = terminalCommandMenu.items({
      canCopy: true,
      destinations: [{ id: "g2", name: "连接性" }],
      copy: () => undefined,
      remove: () => undefined,
      moveTo,
    });
    expect(items.map((item) => item.label)).toEqual(["复制", "移到", "删除"]);
    expect(items[1]?.children?.map((child) => child.label)).toEqual(["连接性"]);
    expect(items[1]?.children?.map((child) => child.id)).toEqual(["move:g2"]);
  });

  it("onSelect 分发给对应 ctx 动作", () => {
    const copy = vi.fn();
    const remove = vi.fn();
    const moveTo = vi.fn();
    const ctx = {
      canCopy: true,
      destinations: [{ id: "g2", name: "连接性" }],
      copy,
      remove,
      moveTo,
    };
    terminalCommandMenu.onSelect("copy", ctx);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    expect(moveTo).not.toHaveBeenCalled();
    terminalCommandMenu.onSelect("delete", ctx);
    expect(remove).toHaveBeenCalledTimes(1);
    terminalCommandMenu.onSelect("move:g2", ctx);
    expect(moveTo).toHaveBeenCalledWith("g2");
  });
});
