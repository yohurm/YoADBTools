import { describe, expect, it } from "vitest";
import { checkboxPaintKind, resolveCheckboxSpec } from "./checkbox-model";

describe("checkbox-model", () => {
  it("缺省未勾选，涂装 idle", () => {
    expect(resolveCheckboxSpec({})).toEqual({ checked: false });
    expect(checkboxPaintKind({ checked: false })).toBe("idle");
  });

  it("checked 原样保留并映射涂装", () => {
    expect(resolveCheckboxSpec({ checked: true })).toEqual({ checked: true });
    expect(checkboxPaintKind({ checked: true })).toBe("checked");
  });
});
