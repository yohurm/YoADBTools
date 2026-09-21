import { describe, expect, it } from "vitest";

import {
  isPendingFocusAdopted,
  resolveVirtualIndicatorHot,
  resolveVirtualListKeyAction,
  shouldEmitAtBottom,
  virtualHostAttrs,
  virtualIndicatorFill,
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
        active: true,
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
    });
    expect(
      virtualRowAttrs({
        key: "row-0",
        selectable: false,
        selected: false,
        active: false,
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
    });
    expect(
      virtualRowAttrs({
        key: "row-2",
        selectable: true,
        selected: true,
        active: false,
        selectionEmpty: false,
        isFirstVisible: false,
      }).tabIndex,
    ).toBe(-1);
  });

  it("宿主 attrs：可选才 listbox；默认 data-tone=document", () => {
    expect(
      virtualHostAttrs({ selectable: false, multi: false }),
    ).toEqual({
      role: undefined,
      "aria-label": undefined,
      "aria-multiselectable": undefined,
      "data-tone": "document",
      "data-layout": "flow",
      "data-reordering": undefined,
      "data-indicator": undefined,
      "data-indicator-hot": undefined,
    });
    expect(
      virtualHostAttrs({ selectable: true, multi: true, tone: "list", ariaLabel: "文件" }),
    ).toEqual({
      role: "listbox",
      "aria-label": "文件",
      "aria-multiselectable": true,
      "data-tone": "list",
      "data-layout": "pool",
      "data-reordering": undefined,
      "data-indicator": undefined,
      "data-indicator-hot": undefined,
    });
    expect(virtualHostAttrs({ selectable: true, multi: false, reordering: true })["data-reordering"]).toBe(
      "",
    );
  });

  it("indicator fill / hot：未 follow 或换位清空；选中填充才 hover/pressed", () => {
    expect(virtualIndicatorFill("row-1", false)).toBe(true);
    expect(virtualIndicatorFill(undefined, false)).toBe(false);
    expect(virtualIndicatorFill("row-1", true)).toBe(false);
    expect(resolveVirtualIndicatorHot({ fill: false, onSelectedFill: true, pressed: false })).toBeUndefined();
    expect(resolveVirtualIndicatorHot({ fill: true, onSelectedFill: false, pressed: false })).toBeUndefined();
    expect(resolveVirtualIndicatorHot({ fill: true, onSelectedFill: true, pressed: false })).toBe("hover");
    expect(resolveVirtualIndicatorHot({ fill: true, onSelectedFill: true, pressed: true })).toBe("pressed");
    expect(
      virtualHostAttrs({
        selectable: true,
        multi: false,
        indicatorFill: true,
        indicatorHot: "hover",
      })["data-indicator"],
    ).toBe("fill");
    expect(
      virtualHostAttrs({
        selectable: true,
        multi: false,
        indicatorFill: true,
        indicatorHot: "pressed",
      })["data-indicator-hot"],
    ).toBe("pressed");
    expect(
      virtualHostAttrs({
        selectable: true,
        multi: false,
        indicatorFill: false,
        indicatorHot: "hover",
      })["data-indicator-hot"],
    ).toBeUndefined();
  });
});
