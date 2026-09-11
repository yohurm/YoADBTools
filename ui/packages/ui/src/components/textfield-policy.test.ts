import { describe, expect, it } from "vitest";
import { resolveTextFieldInteractive, textFieldHostAttrs } from "./textfield-policy";

describe("textfield-policy", () => {
  it("默认可改、不显示清除、status=none", () => {
    expect(resolveTextFieldInteractive({})).toEqual({
      disabled: false,
      showClear: false,
      status: "none",
    });
  });

  it("clearable 且有值才显示清除", () => {
    expect(resolveTextFieldInteractive({ clearable: true, value: "" }).showClear).toBe(false);
    expect(resolveTextFieldInteractive({ clearable: true, value: "ab" }).showClear).toBe(true);
    expect(resolveTextFieldInteractive({ value: "ab" }).showClear).toBe(false);
  });

  it("disabled 关掉输入并隐藏清除", () => {
    expect(
      resolveTextFieldInteractive({ disabled: true, clearable: true, value: "x" }),
    ).toEqual({ disabled: true, showClear: false, status: "none" });
  });

  it("缺省宿主属性是中性涂装", () => {
    expect(textFieldHostAttrs({})).toEqual({
      "data-status": "none",
      "data-paint": "neutral",
      "data-width": "hug",
      "data-prefix": undefined,
      "data-suffix": undefined,
      "data-addon-before": undefined,
      "data-addon-after": undefined,
      "data-clearable": undefined,
      "data-disabled": undefined,
      "data-active": undefined,
      disabled: false,
      "aria-invalid": undefined,
    });
  });

  it("error 写入 data-paint 与 aria-invalid", () => {
    const attrs = textFieldHostAttrs({ status: "error", prefix: "search" });
    expect(attrs["data-status"]).toBe("error");
    expect(attrs["data-paint"]).toBe("error");
    expect(attrs["aria-invalid"]).toBe(true);
    expect(attrs["data-prefix"]).toBe(true);
  });

  it("warning 不报 aria-invalid", () => {
    const attrs = textFieldHostAttrs({ status: "warning", addonAfter: ".apk" });
    expect(attrs["data-paint"]).toBe("warning");
    expect(attrs["aria-invalid"]).toBeUndefined();
    expect(attrs["data-addon-after"]).toBe(true);
  });

  it("disabled 写入 data-disabled，涂装仍跟 status", () => {
    const attrs = textFieldHostAttrs({ status: "error", disabled: true });
    expect(attrs.disabled).toBe(true);
    expect(attrs["data-disabled"]).toBe(true);
    expect(attrs["data-paint"]).toBe("error");
  });

  it("宽度只写 data-width：number / fill / hug", () => {
    expect(textFieldHostAttrs({ type: "number" })["data-width"]).toBe("number");
    expect(textFieldHostAttrs({ type: "number", block: true })["data-width"]).toBe("fill");
    expect(textFieldHostAttrs({})["data-width"]).toBe("hug");
  });

  it("active 只写 data-active，不改涂装", () => {
    const idle = textFieldHostAttrs({});
    expect(idle["data-active"]).toBeUndefined();
    expect(idle["data-paint"]).toBe("neutral");
    const attrs = textFieldHostAttrs({ active: true, status: "warning" });
    expect(attrs["data-active"]).toBe(true);
    expect(attrs["data-paint"]).toBe("warning");
    expect(attrs["data-status"]).toBe("warning");
  });
});
