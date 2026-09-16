import { describe, expect, it } from "vitest";
import {
  canCommitCheckboxChange,
  checkboxHostAttrs,
  resolveCheckboxInteractive,
} from "./checkbox-policy";

describe("checkbox-policy", () => {
  it("默认可点", () => {
    expect(resolveCheckboxInteractive({})).toEqual({ disabled: false });
    expect(canCommitCheckboxChange(false)).toBe(true);
  });

  it("disabled 关掉输入", () => {
    expect(resolveCheckboxInteractive({ disabled: true })).toEqual({ disabled: true });
    expect(canCommitCheckboxChange(true)).toBe(false);
  });

  it("缺省宿主属性是未勾选 idle", () => {
    expect(checkboxHostAttrs({})).toEqual({
      "data-checked": "false",
      "data-paint": "idle",
      "data-disabled": undefined,
      disabled: false,
    });
  });

  it("勾选写入 data-checked 与 checked 涂装", () => {
    const attrs = checkboxHostAttrs({ checked: true });
    expect(attrs["data-checked"]).toBe("true");
    expect(attrs["data-paint"]).toBe("checked");
  });

  it("disabled 写入 data-disabled，涂装仍跟勾选", () => {
    const attrs = checkboxHostAttrs({ checked: true, disabled: true });
    expect(attrs.disabled).toBe(true);
    expect(attrs["data-disabled"]).toBe(true);
    expect(attrs["data-paint"]).toBe("checked");
  });
});
