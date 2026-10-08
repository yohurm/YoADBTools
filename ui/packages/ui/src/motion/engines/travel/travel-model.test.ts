import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

describe("行程端点", () => {
  it("起点和终点都要大于 0", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "travel-model.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("!(from " + "> 0)")).toBe(0);
    expect(times("!(to " + "> 0)")).toBe(0);
    expect(body).toContain("travelOpen(from)");
    expect(body).toContain("travelOpen(to)");
    expect(times("function travelOpen")).toBe(1);
    expect(times("return value > 0")).toBe(1);
    expect(body).toContain("travelFinite(from)");
    expect(body).toContain("travelFinite(to)");
  });
});

describe("行程有限", () => {
  it("起点和终点都要是有限数", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "travel-model.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("Number.isFinite(" + "from)")).toBe(0);
    expect(times("Number.isFinite(" + "to)")).toBe(0);
    expect(body).toContain("travelFinite(from)");
    expect(body).toContain("travelFinite(to)");
    expect(times("function travelFinite")).toBe(1);
    expect(times("return Number.isFinite(value)")).toBe(1);
    expect(times("function travelOpen")).toBe(1);
    expect(body).toContain("travelOpen(from)");
    expect(body).toContain("return value > 0");
  });
});
