import { describe, expect, it } from "vitest";

import {
  VIRTUAL_STICK_THRESHOLD,
  isStuckToBottom,
  isVirtualMulti,
  isVirtualRowSelected,
  isVirtualSelectable,
  isVirtualSelectionEmpty,
  virtualAdjacentSelected,
  virtualIndicatorAnchor,
  virtualIndicatorBox,
  virtualIndicatorFollow,
  virtualIndexOfKey,
  virtualKeyIntent,
  virtualRange,
  virtualRowJoin,
  virtualRowKey,
  virtualRowTabIndex,
  virtualRowTop,
  virtualTotalHeight,
  virtualVisibleKeys,
  virtualVisibleRows,
} from "./virtuallist-model";

describe("virtuallist-model", () => {
  it("总高度 = 行数 × 行高", () => {
    expect(virtualTotalHeight(10, 22)).toBe(220);
  });

  it("窗口含 overscan，夹在 [0, count]", () => {
    expect(virtualRange(0, 100, 20, 50, 2)).toEqual({ start: 0, end: 7 });
    expect(virtualRange(200, 100, 20, 50, 2)).toEqual({ start: 8, end: 17 });
    expect(virtualRange(0, 100, 20, 3, 10)).toEqual({ start: 0, end: 3 });
  });

  it("贴底阈值", () => {
    expect(isStuckToBottom(1000, 200, 800)).toBe(true);
    expect(isStuckToBottom(1000, 200, 800 - VIRTUAL_STICK_THRESHOLD - 1)).toBe(false);
  });

  it("行 key 默认 index，可自定义", () => {
    expect(virtualRowKey("a", 3)).toBe(3);
    expect(virtualRowKey("a", 3, (item) => `k-${item}`)).toBe("k-a");
  });

  it("可见行按窗口切片，遇空洞停止", () => {
    const items = ["a", "b", "c", "d"];
    expect(virtualVisibleRows(items, 1, 3, (item) => item)).toEqual([
      { index: 1, item: "b", key: "b" },
      { index: 2, item: "c", key: "c" },
    ]);
    expect(virtualVisibleRows(["a"], 0, 4)).toEqual([{ index: 0, item: "a", key: 0 }]);
    expect(virtualVisibleKeys(virtualVisibleRows(items, 1, 3, (item) => item))).toEqual(["b", "c"]);
  });

  it("可选 / 多选 / 选中 / 空选", () => {
    expect(isVirtualSelectable(true, false, true)).toBe(true);
    expect(isVirtualSelectable(false, true, true)).toBe(true);
    expect(isVirtualSelectable(true, false, false)).toBe(false);
    expect(isVirtualMulti(true)).toBe(true);
    expect(isVirtualMulti(false)).toBe(false);
    expect(isVirtualRowSelected("a", false, undefined, "a")).toBe(false);
    expect(isVirtualRowSelected("a", true, undefined, "a")).toBe(true);
    expect(isVirtualRowSelected("a", true, new Set(["b"]), "a")).toBe(false);
    expect(isVirtualRowSelected("b", true, new Set(["b"]), null)).toBe(true);
    expect(isVirtualSelectionEmpty(undefined, null)).toBe(true);
    expect(isVirtualSelectionEmpty(undefined, "a")).toBe(false);
    expect(isVirtualSelectionEmpty(new Set(), "a")).toBe(true);
    expect(isVirtualSelectionEmpty(new Set(["a"]), null)).toBe(false);
  });

  it("邻接布尔交给 adjacentJoin：连续块与孤立", () => {
    const items = ["a", "b", "c", "d"];
    const keys = new Set<string | number>(["b", "c"]);
    expect(virtualAdjacentSelected(items, 1, true, keys, null, (item) => item)).toEqual({
      prev: false,
      next: true,
    });
    expect(virtualRowJoin(true, false, true)).toBe("start");
    expect(virtualRowJoin(true, true, true)).toBe("middle");
    expect(virtualRowJoin(true, true, false)).toBe("end");
    expect(virtualRowJoin(true, false, false)).toBe("solo");
    expect(virtualRowJoin(false, false, false)).toBeNull();
  });

  it("roving tabindex：选中=0；空选首可视=0；否则 -1；不可选 undefined", () => {
    expect(virtualRowTabIndex({ selectable: false, selected: true, selectionEmpty: true, isFirstVisible: true })).toBeUndefined();
    expect(virtualRowTabIndex({ selectable: true, selected: true, selectionEmpty: false, isFirstVisible: false })).toBe(0);
    expect(virtualRowTabIndex({ selectable: true, selected: false, selectionEmpty: true, isFirstVisible: true })).toBe(0);
    expect(virtualRowTabIndex({ selectable: true, selected: false, selectionEmpty: true, isFirstVisible: false })).toBe(-1);
    expect(virtualRowTabIndex({ selectable: true, selected: false, selectionEmpty: false, isFirstVisible: true })).toBe(-1);
  });

  it("indicator follow：多选仅 1 个 key；0 或 ≥2 为 undefined", () => {
    expect(virtualIndicatorFollow(false, undefined, "a")).toBeUndefined();
    expect(virtualIndicatorFollow(true, undefined, "a")).toBe("a");
    expect(virtualIndicatorFollow(true, undefined, null)).toBeUndefined();
    expect(virtualIndicatorFollow(true, new Set(), null)).toBeUndefined();
    expect(virtualIndicatorFollow(true, new Set(["only"]), null)).toBe("only");
    expect(virtualIndicatorFollow(true, new Set(["a", "b"]), null)).toBeUndefined();
  });

  it("indicator 几何 = index × itemHeight，宽度由调用方传入", () => {
    expect(virtualRowTop(3, 22)).toBe(66);
    expect(virtualIndicatorBox(3, 22, 400)).toEqual({ x: 0, y: 66, width: 400, height: 22 });
    expect(virtualIndicatorAnchor(["a", "b", "c"], "1", 22, 320)).toEqual({
      x: 0,
      y: 22,
      width: 320,
      height: 22,
    });
    expect(virtualIndicatorAnchor(["a", "b"], undefined, 22, 320)).toBeNull();
    expect(virtualIndexOfKey(["a", "b", "c"], "b", (item) => item)).toBe(1);
    expect(virtualIndexOfKey(["a"], "missing", (item) => item)).toBe(-1);
  });

  it("键盘目标下标夹紧；Enter/Space 是 commit", () => {
    expect(virtualKeyIntent("ArrowDown", 0, 5)).toEqual({ type: "move", index: 1 });
    expect(virtualKeyIntent("ArrowDown", 4, 5)).toEqual({ type: "move", index: 4 });
    expect(virtualKeyIntent("ArrowUp", 0, 5)).toEqual({ type: "move", index: 0 });
    expect(virtualKeyIntent("Home", 3, 5)).toEqual({ type: "move", index: 0 });
    expect(virtualKeyIntent("End", 0, 5)).toEqual({ type: "move", index: 4 });
    expect(virtualKeyIntent("Enter", 2, 5)).toEqual({ type: "commit" });
    expect(virtualKeyIntent(" ", 2, 5)).toEqual({ type: "commit" });
    expect(virtualKeyIntent("Tab", 0, 5)).toBeNull();
    expect(virtualKeyIntent("ArrowDown", 0, 0)).toBeNull();
  });
});
