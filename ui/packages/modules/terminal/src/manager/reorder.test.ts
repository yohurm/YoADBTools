import { describe, expect, it } from "vitest";

import { dropIndexFromCenters, moveStepTo, shiftForReorder } from "./reorder";

describe("命令块步骤排序", () => {
  it("moveStepTo 把一步挪到目标下标", () => {
    const steps = [
      { id: "a", template: "a" },
      { id: "b", template: "b" },
      { id: "c", template: "c" },
    ];
    expect(moveStepTo(steps, 0, 2).map((s) => s.id)).toEqual(["b", "c", "a"]);
    expect(moveStepTo(steps, 2, 0).map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(moveStepTo(steps, 1, 1)).toBe(steps);
  });

  it("dropIndexFromCenters / shiftForReorder 服务拖动预览", () => {
    expect(dropIndexFromCenters([10, 30, 50], 9)).toBe(0);
    expect(dropIndexFromCenters([10, 30, 50], 31)).toBe(2);
    expect(dropIndexFromCenters([10, 30, 50], 80)).toBe(2);
    expect(shiftForReorder(0, 0, 2)).toBe(0);
    expect(shiftForReorder(1, 0, 2)).toBe(-1);
    expect(shiftForReorder(2, 0, 2)).toBe(-1);
    expect(shiftForReorder(1, 2, 0)).toBe(1);
  });
});
