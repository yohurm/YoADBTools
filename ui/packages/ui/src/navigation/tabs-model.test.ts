import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  closeFocusIndex,
  tabAt,
  tabsActiveIndex,
  tabsIndexIsActive,
  tabsKeyIsActivate,
  tabsKeyIntent,
} from "./tabs-model";

describe("tabs-model", () => {
  it("左右循环、Home/End", () => {
    expect(tabsKeyIntent("ArrowRight", 0, 3, false)).toEqual({ type: "activate", index: 1 });
    expect(tabsKeyIntent("ArrowLeft", 0, 3, false)).toEqual({ type: "activate", index: 2 });
    expect(tabsKeyIntent("Home", 2, 3, false)).toEqual({ type: "activate", index: 0 });
    expect(tabsKeyIntent("End", 0, 3, false)).toEqual({ type: "activate", index: 2 });
  });

  it("无激活项时箭头从 0 起算", () => {
    expect(tabsKeyIntent("ArrowRight", -1, 3, false)).toEqual({ type: "activate", index: 1 });
  });

  it("Delete 仅在可关闭且有激活项时关闭", () => {
    expect(tabsKeyIntent("Delete", 1, 3, true)).toEqual({ type: "close", index: 1 });
    expect(tabsKeyIntent("Delete", 1, 3, false)).toBeNull();
    expect(tabsKeyIntent("Delete", -1, 3, true)).toBeNull();
  });

  it("关闭后焦点落到相邻", () => {
    expect(closeFocusIndex(0, 3)).toBe(0);
    expect(closeFocusIndex(2, 3)).toBe(1);
    expect(closeFocusIndex(1, 2)).toBe(0);
  });

  it("按稳定 id 解析激活下标", () => {
    const tabs = [{ id: "a" }, { id: "b" }];
    expect(tabsActiveIndex(tabs, "b")).toBe(1);
    expect(tabsActiveIndex(tabs, null)).toBe(-1);
    expect(tabsActiveIndex(tabs, "missing")).toBe(-1);
    expect(tabAt(tabs, 0)?.id).toBe("a");
    expect(tabAt(tabs, 9)).toBeUndefined();
  });

  it("激活意图只判一次", () => {
    expect(tabsKeyIsActivate({ type: "activate", index: 0 })).toBe(true);
    expect(tabsKeyIsActivate({ type: "close", index: 0 })).toBe(false);
  });

  it("激活下标只判一次", () => {
    expect(tabsIndexIsActive(0)).toBe(true);
    expect(tabsIndexIsActive(2)).toBe(true);
    expect(tabsIndexIsActive(-1)).toBe(false);
    const root = dirname(fileURLToPath(import.meta.url));
    for (const name of ["tabs-model.ts", "tabs-policy.ts", "Tabs.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      if (name === "tabs-model.ts") body = body.replace("return index >= 0", "");
      expect(body, name).not.toContain("activeIndex >= 0");
      expect(body, name).not.toContain("index >= 0");
    }
  });
});
