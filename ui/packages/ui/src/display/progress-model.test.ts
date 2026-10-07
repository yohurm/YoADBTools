import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clampProgressValue, ratioPercent, resolveProgressSize, resolveProgressSpec } from "./progress-model";

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

  it("字节比夹在 0–100，总量无效时为 0", () => {
    expect(ratioPercent(50, 200)).toBe(25);
    expect(ratioPercent(300, 200)).toBe(100);
    expect(ratioPercent(-10, 100)).toBe(0);
    expect(ratioPercent(1, 0)).toBe(0);
  });

  it("轨高缺省与未知值都是 xs，只有 sm 加高", () => {
    expect(resolveProgressSize(undefined)).toBe("xs");
    expect(resolveProgressSize("sm")).toBe("sm");
  });

  it("indeterminate 优先于 value", () => {
    expect(resolveProgressSpec({ value: 40, indeterminate: true })).toEqual({
      mode: "indeterminate",
      value: 40,
    });
  });

  it("不定态与小号轨只在模型里比较一次", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const model = readFileSync(resolve(dir, "progress-model.ts"), "utf8");
    const policy = readFileSync(resolve(dir, "progress-policy.ts"), "utf8");
    const body = model.replace('return mode === "indeterminate"', "").replace('return size === "sm"', "");
    expect(body).not.toContain('=== "indeterminate"');
    expect(body).not.toContain('=== "sm"');
    expect(policy).not.toContain('=== "indeterminate"');
    expect(policy).not.toContain('=== "sm"');
    expect(policy).toContain("progressIsIndeterminate");
    expect(policy).toContain("progressSizeIsSm");
  });
});
