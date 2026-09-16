import { describe, expect, it } from "vitest";

import { normalizeTravelAxes, resolveTravel, resolveTravelSize } from "./travel-model";
import { travelHostAttrs } from "./travel-policy";

describe("travel", () => {
  it("首帧和零盒不开行程", () => {
    expect(resolveTravel({ from: 0, to: 400 })).toBeUndefined();
    expect(resolveTravel({ from: 400, to: 0 })).toBeUndefined();
    expect(resolveTravel({ from: Number.NaN, to: 400 })).toBeUndefined();
  });

  it("小于阈值的抖动不开行程", () => {
    expect(resolveTravel({ from: 400, to: 400.4 })).toBeUndefined();
    expect(resolveTravel({ from: 400, to: 401 })).toEqual({ from: 400, to: 401 });
  });

  it("用后 px 才构成行程；只有 used 相", () => {
    expect(resolveTravel({ from: 420, to: 560 })).toEqual({ from: 420, to: 560 });
    expect(travelHostAttrs()["data-travel"]).toBe("used");
    expect(travelHostAttrs(["block"])["data-axis-block"]).toBe("");
    expect(travelHostAttrs(["block"])["data-axis-inline"]).toBeUndefined();
    expect(travelHostAttrs(["inline"])["data-axis-inline"]).toBe("");
  });

  it("缺省只走 block；两轴可同拍", () => {
    expect(normalizeTravelAxes()).toEqual(["block"]);
    expect(normalizeTravelAxes(["inline", "block", "block"])).toEqual(["block", "inline"]);
    expect(
      resolveTravelSize({
        from: { block: 400, inline: 320 },
        to: { block: 560, inline: 328 },
        axes: ["block", "inline"],
      }),
    ).toEqual({
      block: { from: 400, to: 560 },
      inline: { from: 320, to: 328 },
    });
    expect(
      resolveTravelSize({
        from: { block: 400, inline: 320 },
        to: { block: 400.2, inline: 320.2 },
        axes: ["block", "inline"],
      }),
    ).toBeUndefined();
  });
});
