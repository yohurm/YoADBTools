import { describe, expect, it } from "vitest";
import { hasFormRowSlot, resolveFormRowSlots } from "./formrow-model";

describe("formrow-model", () => {
  it("缺省两槽皆空", () => {
    expect(resolveFormRowSlots({})).toEqual({ description: false, note: false });
  });

  it("空串与空白不算占槽", () => {
    expect(hasFormRowSlot("")).toBe(false);
    expect(hasFormRowSlot("   ")).toBe(false);
    expect(hasFormRowSlot(null)).toBe(false);
    expect(hasFormRowSlot(false)).toBe(false);
  });

  it("非空说明与备注算占槽", () => {
    expect(hasFormRowSlot("跟随系统")).toBe(true);
    expect(resolveFormRowSlots({ description: "说明", note: "立即生效" })).toEqual({
      description: true,
      note: true,
    });
  });
});
