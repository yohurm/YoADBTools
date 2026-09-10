import { describe, expect, it } from "vitest";
import { clampProgressValue, resolveProgressSpec } from "./progress-model";

describe("progress-model", () => {
  it("缺省是确定态 0", () => {
    expect(resolveProgressSpec({})).toEqual({ mode: "determinate", value: 0 });
  });

  it("value 夹取到 0–100，非有限数视为 0", () => {
    expect(clampProgressValue(50)).toBe(50);
    expect(clampProgressValue(-10)).toBe(0);
    expect(clampProgressValue(150)).toBe(100);
    expect(clampProgressValue(Number.NaN)).toBe(0);
    expect(clampProgressValue(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("indeterminate 优先于 value", () => {
    expect(resolveProgressSpec({ value: 40, indeterminate: true })).toEqual({
      mode: "indeterminate",
      value: 40,
    });
  });
});
