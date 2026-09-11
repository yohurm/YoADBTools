import { describe, expect, it } from "vitest";

import {
  beginReorderSession,
  canReorderList,
  commitReorderSession,
  isHomeInsert,
  moveReorderSession,
  previewDest,
  reorderBarAttrs,
  reorderOverlayAttrs,
  resolveReorderKeyDelta,
  shouldAcceptReorderPointer,
  shouldCancelReorder,
} from "./reorder-policy";

describe("reorder-policy", () => {
  it("两项以上才接受主键拖动", () => {
    expect(canReorderList(1)).toBe(false);
    expect(shouldAcceptReorderPointer(0, 2)).toBe(true);
    expect(shouldAcceptReorderPointer(2, 3)).toBe(false);
  });

  it("会话只在离开原槽时提交", () => {
    const started = beginReorderSession(0, "a");
    expect(started).toEqual({ from: 0, insert: 0, key: "a" });
    expect(isHomeInsert(started)).toBe(true);
    expect(commitReorderSession(started)).toBeNull();
    const neighbor = moveReorderSession(started, 1);
    expect(isHomeInsert(neighbor)).toBe(true);
    expect(commitReorderSession(neighbor)).toBeNull();
    const moved = moveReorderSession(started, 3);
    expect(previewDest(moved)).toBe(2);
    expect(commitReorderSession(moved)).toEqual({ from: 0, to: 2 });
  });

  it("条与浮层 attrs 只在 open 时写 data-open", () => {
    expect(reorderBarAttrs(true, 64)).toEqual({
      "data-open": "",
      style: { top: "64px" },
    });
    expect(reorderOverlayAttrs(true, 12, 32).style).toEqual({ top: "12px", height: "32px" });
    expect(reorderBarAttrs(false, 64)["data-open"]).toBeUndefined();
  });

  it("换位键只认修饰 + 方向；Escape 取消", () => {
    expect(resolveReorderKeyDelta("ArrowUp", false)).toBeNull();
    expect(resolveReorderKeyDelta("ArrowDown", true)).toBe(1);
    expect(shouldCancelReorder("Escape")).toBe(true);
    expect(shouldCancelReorder("ArrowUp")).toBe(false);
  });
});
