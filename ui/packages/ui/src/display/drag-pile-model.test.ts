import { describe, expect, it } from "vitest";

import {
  GATHER_BACK_CAP,
  GATHER_LIFT_SCALE,
  dragPileShowsCount,
  gatherPaint,
  gatherScale,
  gatherShownCount,
  resolveDragPilePhase,
} from "./drag-pile-model";

describe("drag-pile-model", () => {
  it("主预览加最多两张子预览", () => {
    expect(gatherShownCount(0)).toBe(0);
    expect(gatherShownCount(1)).toBe(1);
    expect(gatherShownCount(2)).toBe(2);
    expect(gatherShownCount(3)).toBe(1 + GATHER_BACK_CAP);
    expect(gatherShownCount(8)).toBe(3);
    expect(dragPileShowsCount(1)).toBe(false);
    expect(dragPileShowsCount(2)).toBe(true);
  });

  it("子预览按 ArkUI Gather 扇开，多出来的牌先透明", () => {
    expect(gatherPaint(0)).toEqual({ opacity: 1, angle: 0 });
    expect(gatherPaint(1)).toEqual({ opacity: 0.6, angle: 8 });
    expect(gatherPaint(2)).toEqual({ opacity: 0.3, angle: -8 });
    expect(gatherPaint(3)).toEqual({ opacity: 0, angle: 0 });
    expect(gatherScale("home")).toBe(1);
    expect(gatherScale("drop")).toBe(1);
    expect(gatherScale("carry")).toBe(GATHER_LIFT_SCALE);
  });

  it("未知阶段当跟指针", () => {
    expect(resolveDragPilePhase(undefined)).toBe("carry");
    expect(resolveDragPilePhase("nope")).toBe("carry");
    expect(resolveDragPilePhase("home")).toBe("home");
  });
});
