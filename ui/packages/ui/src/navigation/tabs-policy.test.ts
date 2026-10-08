import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  applyTabsKeyIntent,
  resolveTabsChrome,
  resolveTabsKeyAction,
  tabsActionIsActivate,
  tabsIndicatorVariant,
  tabsTabAttrs,
} from "./tabs-policy";

const TABS = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("tabs-policy", () => {
  it("关闭与新建由回调有无决定", () => {
    expect(resolveTabsChrome({})).toEqual({ canClose: false, canNew: false });
    expect(resolveTabsChrome({ onClose: () => undefined, onNew: () => undefined })).toEqual({
      canClose: true,
      canNew: true,
    });
  });

  it("激活项才进 Tab 序，且不把激活写成 selected 实底字段", () => {
    expect(tabsTabAttrs("a", "a")).toEqual({ "aria-selected": true, tabindex: 0, active: true });
    expect(tabsTabAttrs("b", "a")).toEqual({ "aria-selected": false, tabindex: -1, active: false });
  });

  it("把键盘意图收成激活 / 关闭动作", () => {
    expect(applyTabsKeyIntent({ type: "activate", index: 2 }, TABS)).toEqual({
      type: "activate",
      id: "c",
      index: 2,
      focusIndex: 2,
    });
    expect(applyTabsKeyIntent({ type: "close", index: 0 }, TABS)).toEqual({
      type: "close",
      id: "a",
      index: 0,
      focusIndex: 0,
    });
  });

  it("越界意图丢弃", () => {
    expect(applyTabsKeyIntent({ type: "activate", index: 9 }, TABS)).toBeNull();
  });

  it("从按键一次解析到动作", () => {
    expect(resolveTabsKeyAction("ArrowRight", TABS, "a", false)).toEqual({
      type: "activate",
      id: "b",
      index: 1,
      focusIndex: 1,
    });
    expect(resolveTabsKeyAction("Delete", TABS, "b", true)?.id).toBe("b");
    expect(resolveTabsKeyAction("Delete", TABS, "b", false)).toBeNull();
  });

  it("激活动作只判一次", () => {
    expect(tabsActionIsActivate({ type: "activate", id: "a", index: 0, focusIndex: 0 })).toBe(true);
    expect(tabsActionIsActivate({ type: "close", id: "a", index: 0, focusIndex: 0 })).toBe(false);
  });
});

describe("标签页激活只在所属层判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("意图与动作不再在策略和视图里互比", () => {
    for (const name of ["tabs-model.ts", "tabs-policy.ts", "Tabs.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      if (name === "tabs-model.ts") {
        body = body.replace('export type TabsKeyKind = "activate" | "close";', "");
        body = body.replace('return item.type === "activate"', "");
      }
      expect(body, name).not.toContain('"activate" | "close"');
      expect(body, name).not.toContain('type === "activate"');
      expect(body, name).not.toContain('type === "close"');
    }
  });

  it("页签指示底边只写一次，不与 fill / thumb 合并", () => {
    expect(tabsIndicatorVariant()).toBe("underline");
    const root = dirname(fileURLToPath(import.meta.url));
    for (const name of ["tabs-model.ts", "tabs-policy.ts", "Tabs.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      if (name === "tabs-policy.ts") {
        body = body.replace('(): "underline"', "").replace('return "underline"', "");
      }
      expect(body, name).not.toContain('"underline"');
      expect(body, name).not.toContain('variant="underline"');
      expect(body, name).not.toContain('data-indicator-variant="underline"');
    }
  });
});
