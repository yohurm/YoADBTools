import { describe, expect, it } from "vitest";
import { formRowHostAttrs, shouldRenderFormRowSlot } from "./formrow-policy";

describe("formrow-policy", () => {
  it("缺省不写槽位标记", () => {
    expect(formRowHostAttrs({})).toEqual({
      "data-has-description": undefined,
      "data-has-note": undefined,
    });
  });

  it("有说明/备注才写 data-*", () => {
    expect(formRowHostAttrs({ description: "跟随系统", note: "立即生效" })).toEqual({
      "data-has-description": true,
      "data-has-note": true,
    });
  });

  it("空槽不渲染", () => {
    expect(shouldRenderFormRowSlot(undefined)).toBe(false);
    expect(shouldRenderFormRowSlot("")).toBe(false);
    expect(shouldRenderFormRowSlot("立即生效")).toBe(true);
  });
});
