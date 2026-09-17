import { describe, expect, it } from "vitest";

import { GROW_TRIP_PROPERTY, resolveGrow } from "./grow-model";
import { growHostAttrs } from "./grow-policy";

describe("grow", () => {
  it("首帧和零盒不开行程", () => {
    expect(resolveGrow(0, 96)).toBeUndefined();
    expect(resolveGrow(96, 0)).toBeUndefined();
    expect(resolveGrow(Number.NaN, 96)).toBeUndefined();
  });

  it("小于阈值的抖动不开行程", () => {
    expect(resolveGrow(96, 96.4)).toBeUndefined();
    expect(resolveGrow(96, 97)).toEqual({ from: 96, to: 97 });
  });

  it("升降同一条通路；只有 used 相", () => {
    expect(resolveGrow(48, 139)).toEqual({ from: 48, to: 139 });
    expect(resolveGrow(139, 48)).toEqual({ from: 139, to: 48 });
    expect(growHostAttrs()["data-grow"]).toBe("used");
    expect(GROW_TRIP_PROPERTY).toBe("height");
  });
});
