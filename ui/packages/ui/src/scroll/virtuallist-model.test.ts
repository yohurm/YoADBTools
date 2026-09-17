import { describe, expect, it } from "vitest";

import { Spacing } from "../tokens/spacing";
import {
  VIRTUAL_STICK_THRESHOLD,
  isStuckToBottom,
  isVirtualMulti,
  isVirtualRowSelected,
  isVirtualSelectable,
  isVirtualSelectionEmpty,
  virtualActiveKey,
  virtualIndicatorAnchor,
  virtualIndicatorBox,
  virtualIndicatorFollow,
  virtualIndexOfKey,
  virtualKeyIntent,
  virtualNearestScrollTop,
  virtualPoolIndex,
  virtualPoolOrigin,
  virtualPoolSize,
  virtualPoolSlots,
  virtualRowKey,
  virtualRowBoxStyle,
  virtualRowOffsetY,
  virtualRowTabIndex,
  virtualRowTop,
  virtualRowTransform,
  virtualTotalHeight,
} from "./virtuallist-model";

describe("virtuallist-model", () => {
  it("总高度 = 行数 × 行高", () => {
    expect(virtualTotalHeight(10, 22)).toBe(220);
  });

  it("槽位池大小随视口稳定，原点夹在数据范围内", () => {
    expect(virtualPoolSize(100, 20, 2, 50)).toBe(10);
    expect(virtualPoolSize(0, 20, 10, 100)).toBe(21);
    expect(virtualPoolSize(100, 20, 10, 3)).toBe(3);
    expect(virtualPoolSize(100, 20, 2, 0)).toBe(0);
    expect(virtualPoolOrigin(0, 20, 2, 50, 10)).toBe(0);
    expect(virtualPoolOrigin(200, 20, 2, 50, 10)).toBe(8);
    expect(virtualPoolOrigin(800, 20, 2, 50, 10)).toBe(38);
    expect(virtualPoolOrigin(840, 20, 2, 50, 10)).toBe(40);
    expect(virtualPoolIndex(8, 0)).toBe(8);
    expect(virtualPoolIndex(8, 9)).toBe(17);
    expect(virtualPoolSlots(3)).toEqual([0, 1, 2]);
    expect(virtualPoolSlots(0)).toEqual([]);
    const midSize = virtualPoolSize(100, 20, 2, 50);
    const midOrigin = virtualPoolOrigin(200, 20, 2, 50, midSize);
    expect(virtualPoolSlots(midSize).map((slot) => virtualPoolIndex(midOrigin, slot))).toEqual([
      8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);
    const shortSize = virtualPoolSize(100, 20, 10, 3);
    expect(virtualPoolOrigin(0, 20, 10, 3, shortSize)).toBe(0);
    expect(virtualPoolSlots(shortSize)).toEqual([0, 1, 2]);
  });

  it("贴底阈值", () => {
    expect(VIRTUAL_STICK_THRESHOLD).toBe(Spacing.TwoXl);
    expect(isStuckToBottom(1000, 200, 800)).toBe(true);
    expect(isStuckToBottom(1000, 200, 800 - VIRTUAL_STICK_THRESHOLD - 1)).toBe(false);
  });

  it("行 key 默认 index，可自定义", () => {
    expect(virtualRowKey("a", 3)).toBe(3);
    expect(virtualRowKey("a", 3, (item) => `k-${item}`)).toBe("k-a");
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

  it("活动行：多选焦点锚在集内才用，否则第一项；空选 null", () => {
    expect(virtualActiveKey(undefined, "a", null)).toBe("a");
    expect(virtualActiveKey(undefined, null, "a")).toBeNull();
    expect(virtualActiveKey(new Set(), null, "a")).toBeNull();
    expect(virtualActiveKey(new Set(["only"]), null, null)).toBe("only");
    expect(virtualActiveKey(new Set(["a", "b"]), null, "b")).toBe("b");
    expect(virtualActiveKey(new Set(["a", "b"]), null, "z")).toBe("a");
    expect(virtualActiveKey(new Set(["a", "b"]), null, null)).toBe("a");
  });

  it("roving tabindex：活动行=0；空选首可视=0；否则 -1；不可选 undefined", () => {
    expect(
      virtualRowTabIndex({ selectable: false, active: true, selectionEmpty: true, isFirstVisible: true }),
    ).toBeUndefined();
    expect(
      virtualRowTabIndex({ selectable: true, active: true, selectionEmpty: false, isFirstVisible: false }),
    ).toBe(0);
    expect(
      virtualRowTabIndex({ selectable: true, active: false, selectionEmpty: false, isFirstVisible: false }),
    ).toBe(-1);
    expect(
      virtualRowTabIndex({ selectable: true, active: false, selectionEmpty: true, isFirstVisible: true }),
    ).toBe(0);
    expect(
      virtualRowTabIndex({ selectable: true, active: false, selectionEmpty: true, isFirstVisible: false }),
    ).toBe(-1);
    expect(
      virtualRowTabIndex({ selectable: true, active: false, selectionEmpty: false, isFirstVisible: true }),
    ).toBe(-1);
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
    expect(virtualRowOffsetY(3, 22)).toBe(66);
    expect(virtualRowOffsetY(3, 22, 1)).toBe(88);
    expect(virtualRowTransform(3, 22)).toBe("translate3d(0, 66px, 0)");
    expect(virtualRowTransform(3, 22, -1)).toBe("translate3d(0, 44px, 0)");
    expect(virtualRowBoxStyle(3, 22)).toEqual({
      position: "absolute",
      top: "0px",
      left: "0px",
      right: "0px",
      height: "22px",
      transform: "translate3d(0, 66px, 0)",
    });
    expect(virtualRowBoxStyle(1, 28, 0, false).visibility).toBe("hidden");
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

  it("nearest 目标 top：已可见不动；上沿钉行顶、下沿钉行底", () => {
    expect(virtualNearestScrollTop(40, 20, 100, 20)).toBe(20);
    expect(virtualNearestScrollTop(40, 20, 100, 40)).toBe(40);
    expect(virtualNearestScrollTop(120, 20, 100, 40)).toBe(40);
    expect(virtualNearestScrollTop(0, 20, 100, 40)).toBe(0);
    expect(virtualNearestScrollTop(200, 20, 100, 40)).toBe(120);
    expect(virtualNearestScrollTop(80, 20, 0, 40)).toBe(40);
    expect(virtualNearestScrollTop(80, 0, 100, 40)).toBe(40);
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
