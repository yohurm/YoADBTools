import { describe, expect, it } from "vitest";

import {
  isPendingFocusAdopted,
  resolveVirtualListKeyAction,
  shouldEmitAtBottom,
  virtualHostAttrs,
  virtualRowAttrs,
} from "./virtuallist-policy";

describe("virtuallist-policy", () => {
  it("键盘收成 move / commit；未识别为 null", () => {
    expect(resolveVirtualListKeyAction("ArrowDown", 1, 4)).toEqual({ type: "move", index: 2 });
    expect(resolveVirtualListKeyAction("Home", 2, 4)).toEqual({ type: "move", index: 0 });
    expect(resolveVirtualListKeyAction("Enter", 1, 4)).toEqual({ type: "commit" });
    expect(resolveVirtualListKeyAction("x", 1, 4)).toBeNull();
    expect(resolveVirtualListKeyAction("ArrowDown", 0, 0)).toBeNull();
  });

  it("程序化滚底不 emit；贴底状态未变不 emit", () => {
    expect(shouldEmitAtBottom(true, false, true)).toBe(false);
    expect(shouldEmitAtBottom(false, true, true)).toBe(false);
    expect(shouldEmitAtBottom(false, false, true)).toBe(true);
    expect(shouldEmitAtBottom(false, true, false)).toBe(true);
  });

  it("pendingFocusKey 被 selectedKey / selectedKeys 采纳才确认", () => {
    expect(isPendingFocusAdopted(null, false, "a", null)).toBe(false);
    expect(isPendingFocusAdopted("a", false, "a", null)).toBe(true);
    expect(isPendingFocusAdopted("a", false, "b", null)).toBe(false);
    expect(isPendingFocusAdopted("a", true, null, new Set(["a"]))).toBe(true);
    expect(isPendingFocusAdopted("a", true, null, new Set(["b"]))).toBe(false);
    expect(isPendingFocusAdopted("a", true, "a", null)).toBe(false);
  });

  it("行 attrs 只出 data/aria/tabIndex 与配方布尔", () => {
    expect(
      virtualRowAttrs({
        key: "row-1",
        selectable: true,
        selected: true,
        prevSelected: false,
        nextSelected: true,
        selectionEmpty: false,
        isFirstVisible: false,
      }),
    ).toEqual({
      "data-key": "row-1",
      role: "option",
      "aria-selected": true,
      tabIndex: 0,
      interactive: true,
      selected: true,
      selStart: true,
      selMid: false,
      selEnd: false,
    });
    expect(
      virtualRowAttrs({
        key: "row-0",
        selectable: false,
        selected: false,
        prevSelected: false,
        nextSelected: false,
        selectionEmpty: true,
        isFirstVisible: true,
      }),
    ).toEqual({
      "data-key": "row-0",
      role: undefined,
      "aria-selected": undefined,
      tabIndex: undefined,
      interactive: false,
      selected: false,
      selStart: false,
      selMid: false,
      selEnd: false,
    });
  });

  it("宿主 attrs：可选才 listbox；默认 data-tone=document", () => {
    expect(virtualHostAttrs({ selectable: false, multi: false })).toEqual({
      role: undefined,
      "aria-label": undefined,
      "aria-multiselectable": undefined,
      "data-tone": "document",
    });
    expect(
      virtualHostAttrs({ selectable: true, multi: true, tone: "list", ariaLabel: "文件" }),
    ).toEqual({
      role: "listbox",
      "aria-label": "文件",
      "aria-multiselectable": true,
      "data-tone": "list",
    });
  });
});
