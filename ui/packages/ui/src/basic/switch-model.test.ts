import { describe, expect, it } from "vitest";
import { resolveSwitchSpec, switchPaintKind } from "./switch-model";

describe("switch-model", () => {
  it("缺省关闭，涂装 off", () => {
    expect(resolveSwitchSpec({})).toEqual({ checked: false });
    expect(switchPaintKind({ checked: false })).toBe("off");
  });

  it("checked 原样保留并映射涂装", () => {
    expect(resolveSwitchSpec({ checked: true })).toEqual({ checked: true });
    expect(switchPaintKind({ checked: true })).toBe("on");
  });
});
