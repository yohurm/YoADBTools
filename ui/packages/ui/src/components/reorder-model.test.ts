import { describe, expect, it } from "vitest";

import { Spacing } from "../tokens/spacing";
import {
  REORDER_ARM_DISTANCE,
  dropIndexFromCenters,
  insertIndexFromPointerY,
  isReorderArmed,
  moveIndexFromInsert,
  moveItemTo,
  overlayOffset,
  reorderBarOffset,
  rowReorderShift,
  shiftForReorder,
} from "./reorder-model";

describe("reorder-model", () => {
  it("moveItemTo 把一项挪到目标下标", () => {
    expect(moveItemTo(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItemTo(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    const same = ["a", "b"];
    expect(moveItemTo(same, 0, 0)).toBe(same);
  });

  it("insertIndexFromPointerY 落最近缝，可到末行之后", () => {
    expect(insertIndexFromPointerY(100, 0, 32, 3, 99)).toBe(0);
    expect(insertIndexFromPointerY(100, 0, 32, 3, 116)).toBe(1);
    expect(insertIndexFromPointerY(100, 0, 32, 3, 196)).toBe(3);
  });

  it("moveIndexFromInsert 原槽不换位", () => {
    expect(moveIndexFromInsert(1, 1)).toBeNull();
    expect(moveIndexFromInsert(1, 2)).toBeNull();
    expect(moveIndexFromInsert(0, 3)).toBe(2);
    expect(moveIndexFromInsert(2, 0)).toBe(0);
  });

  it("dropIndexFromCenters / shiftForReorder / 源行跟 dest", () => {
    expect(dropIndexFromCenters([10, 30, 50], 9)).toBe(0);
    expect(shiftForReorder(1, 0, 2)).toBe(-1);
    expect(rowReorderShift(0, 0, 2)).toBe(2);
    expect(rowReorderShift(1, 0, 2)).toBe(-1);
  });

  it("armed 距离走 Spacing.Sm；条钉缝；浮层夹在视口", () => {
    expect(REORDER_ARM_DISTANCE).toBe(Spacing.Sm);
    expect(isReorderArmed(10, 10 + Spacing.Sm)).toBe(true);
    expect(reorderBarOffset(2, 32)).toBe(64);
    expect(overlayOffset(80, 10, 8, 32, 100)).toBe(62);
    expect(overlayOffset(0, 10, 8, 32, 100)).toBe(0);
  });
});
