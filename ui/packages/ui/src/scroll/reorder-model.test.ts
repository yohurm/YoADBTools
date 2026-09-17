import { describe, expect, it } from "vitest";

import { Spacing } from "../tokens/spacing";
import {
  REORDER_ARM_DISTANCE,
  contentTopInViewport,
  insertIndexFromPointerY,
  insertIndexFromRowBoxes,
  isReorderArmed,
  moveIndexFromInsert,
  moveItemTo,
  overlayOffset,
  pointerContentY,
  reorderBarOffset,
  rowTopInViewport,
  reorderBarOffsetFromBoxes,
  shiftForReorder,
  shiftPxForReorder,
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

  it("insertIndexFromPointerY 认 scrollTop≠0 且 listTop≠clientY，与 pointerContentY 同一代数", () => {
    const listTop = 80;
    const scrollTop = 40;
    const itemHeight = 32;
    const count = 3;
    const insert = (clientY: number) =>
      insertIndexFromPointerY(listTop, scrollTop, itemHeight, count, clientY);
    const viaContent = (clientY: number) =>
      Math.max(0, Math.min(count, Math.round(pointerContentY(listTop, scrollTop, clientY) / itemHeight)));
    expect(insert(39)).toBe(0);
    expect(insert(39)).toBe(viaContent(39));
    expect(insert(56)).toBe(1);
    expect(insert(56)).toBe(viaContent(56));
    expect(insert(136)).toBe(3);
    expect(insert(136)).toBe(viaContent(136));
    expect(listTop).not.toBe(39);
    expect(listTop).not.toBe(56);
    expect(listTop).not.toBe(136);
    expect(insertIndexFromPointerY(listTop, 0, itemHeight, count, 56)).not.toBe(1);
  });

  it("moveIndexFromInsert 原槽不换位", () => {
    expect(moveIndexFromInsert(1, 1)).toBeNull();
    expect(moveIndexFromInsert(1, 2)).toBeNull();
    expect(moveIndexFromInsert(0, 3)).toBe(2);
    expect(moveIndexFromInsert(2, 0)).toBe(0);
  });

  it("shiftForReorder 只让邻行，源行恒 0", () => {
    expect(shiftForReorder(0, 0, 2)).toBe(0);
    expect(shiftForReorder(1, 0, 2)).toBe(-1);
    expect(shiftForReorder(2, 0, 2)).toBe(-1);
    expect(shiftForReorder(3, 0, 2)).toBe(0);
    expect(shiftForReorder(2, 2, 0)).toBe(0);
    expect(shiftForReorder(0, 2, 0)).toBe(1);
    expect(shiftForReorder(1, 2, 0)).toBe(1);
  });

  it("armed 距离走 Spacing.Sm；条钉缝；浮层夹在视口", () => {
    expect(REORDER_ARM_DISTANCE).toBe(Spacing.Sm);
    expect(isReorderArmed(10, 10 + Spacing.Sm)).toBe(true);
    expect(reorderBarOffset(2, 32)).toBe(64);
    expect(overlayOffset(80, 10, 8, 32, 100)).toBe(62);
    expect(overlayOffset(0, 10, 8, 32, 100)).toBe(0);
  });

  it("变高行盒按中线插缝，条钉累计高", () => {
    const boxes = [
      { top: 0, height: 40 },
      { top: 40, height: 80 },
      { top: 120, height: 24 },
    ];
    expect(insertIndexFromRowBoxes(boxes, 10)).toBe(0);
    expect(insertIndexFromRowBoxes(boxes, 90)).toBe(2);
    expect(insertIndexFromRowBoxes(boxes, 200)).toBe(3);
    expect(reorderBarOffsetFromBoxes(boxes, 0)).toBe(0);
    expect(reorderBarOffsetFromBoxes(boxes, 2)).toBe(120);
    expect(shiftPxForReorder(0, 0, 2, 40)).toBe(0);
    expect(shiftPxForReorder(1, 0, 2, 40)).toBe(-40);
    expect(shiftPxForReorder(2, 0, 2, 40)).toBe(-40);
    expect(shiftPxForReorder(2, 2, 0, 24)).toBe(0);
    expect(shiftPxForReorder(0, 2, 0, 24)).toBe(24);
    expect(pointerContentY(10, 8, 30)).toBe(28);
  });

  it("内容坐标相对视口顶 + scrollTop，与视口 Y 互逆", () => {
    const viewTop = 80;
    const scrollTop = 40;
    expect(pointerContentY(viewTop, scrollTop, 40)).toBe(0);
    expect(pointerContentY(viewTop, scrollTop, 80)).toBe(40);
    expect(pointerContentY(viewTop, scrollTop, 160)).toBe(120);
    expect(contentTopInViewport(viewTop, scrollTop, 0)).toBe(40);
    expect(contentTopInViewport(viewTop, scrollTop, 120)).toBe(160);
    expect(rowTopInViewport(viewTop, scrollTop, 0, 40)).toBe(40);
    expect(pointerContentY(40, scrollTop, 40)).not.toBe(0);
  });
});
