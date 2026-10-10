import { describe, expect, it } from "vitest";

import {
  indexAtTail,
  indexFetchAt,
  indexFromOffset,
  indexFromPointer,
  indexPageHolds,
  indexPageShift,
  indexTailOffset,
  indexThumbSpan,
  indexViewRows,
  indexWheelStep,
} from "./index-model";

describe("行号滚轴", () => {
  it("滑块是可见行除以总行", () => {
    expect(indexThumbSpan(20, 100)).toBeCloseTo(0.2);
    expect(indexThumbSpan(100, 40)).toBe(1);
    expect(indexThumbSpan(0, 0)).toBe(1);
  });

  it("拖动按轨道比例换成行号", () => {
    expect(indexFromPointer(0, 200, 100, 20)).toBe(0);
    expect(indexFromPointer(200, 200, 100, 20)).toBe(80);
    expect(indexFromPointer(10, 0, 100, 20)).toBe(0);
  });

  it("滚轮不足一行时仍按方向走一行", () => {
    expect(indexWheelStep(48, 24)).toBe(2);
    expect(indexWheelStep(8, 24)).toBe(1);
    expect(indexWheelStep(-8, 24)).toBe(-1);
    expect(indexWheelStep(0, 24)).toBe(0);
  });

  it("页尾闩上跟尾", () => {
    expect(indexAtTail(80, 20, 100)).toBe(true);
    expect(indexAtTail(10, 20, 100)).toBe(false);
  });

  it("钉底时滑块贴轨道末端", () => {
    expect(indexTailOffset(1600, 200)).toBe(1400);
    expect(indexTailOffset(80, 200)).toBe(0);
  });

  it("钉底把当前页的最后一行落在视口底", () => {
    expect(indexPageShift(1400, 0, 80, 20, 200)).toBe(1400);
    expect(indexPageShift(100_000 * 20 - 200, 99_920, 80, 20, 200)).toBe(1400);
  });

  it("离开底部后页起点对齐视口顶", () => {
    expect(indexPageShift(40 * 20, 40, 80, 20, 200)).toBe(0);
  });

  it("页内拖动不向环要页", () => {
    expect(indexPageHolds(0, 80, 20, 10, 1000)).toBe(true);
    expect(indexPageHolds(0, 80, 70, 10, 1000)).toBe(false);
    expect(indexPageHolds(0, 28, 0, 20, 28)).toBe(true);
  });

  it("要页时视口落在页的中部", () => {
    expect(indexFetchAt(70, 80, 10)).toBe(35);
    expect(indexFetchAt(0, 80, 10)).toBe(0);
    expect(indexFromOffset(1400, 20)).toBe(70);
    expect(indexViewRows(200, 20)).toBe(10);
  });
});
