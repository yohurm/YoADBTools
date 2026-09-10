import { describe, expect, it } from "vitest";

import { applyTabsKeyIntent, resolveTabsChrome, resolveTabsKeyAction, tabsTabAttrs } from "./tabs-policy";

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
});
