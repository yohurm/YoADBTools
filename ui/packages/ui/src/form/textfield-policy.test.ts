import { describe, expect, it } from "vitest";
import { resolveTextFieldInteractive, textFieldHostAttrs, textFieldStepperState } from "./textfield-policy";

describe("textfield-policy", () => {
  it("默认可改、不显示清除、status=none", () => {
    expect(resolveTextFieldInteractive({})).toEqual({
      disabled: false,
      readOnly: false,
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
    ).toEqual({ disabled: true, readOnly: false, showClear: false, status: "none" });
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
      "data-tokens": undefined,
      "data-clearable": undefined,
      "data-disabled": undefined,
      "data-readonly": undefined,
      "data-active": undefined,
      "data-multiline": undefined,
      "data-stepper": undefined,
      "data-font": undefined,
      disabled: false,
      readOnly: false,
      "aria-invalid": undefined,
      rows: 1,
      maxRows: 1,
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

  it("readOnly 写入 data-readonly，不灰、隐藏清除", () => {
    const attrs = textFieldHostAttrs({ readOnly: true, clearable: true, value: "C:\\adb.exe" });
    expect(attrs.readOnly).toBe(true);
    expect(attrs.disabled).toBe(false);
    expect(attrs["data-readonly"]).toBe(true);
    expect(attrs["data-disabled"]).toBeUndefined();
    expect(attrs["data-clearable"]).toBeUndefined();
  });

  it("宽度只写 data-width：number / fill / hug / control", () => {
    expect(textFieldHostAttrs({ type: "number" })["data-width"]).toBe("number");
    expect(textFieldHostAttrs({ type: "number", block: true })["data-width"]).toBe("fill");
    expect(textFieldHostAttrs({})["data-width"]).toBe("hug");
    expect(textFieldHostAttrs({ width: "control" })["data-width"]).toBe("control");
    expect(textFieldHostAttrs({ width: "control", block: true })["data-width"]).toBe("control");
  });

  it("tokens 写 data-tokens", () => {
    expect(textFieldHostAttrs({})["data-tokens"]).toBeUndefined();
    expect(textFieldHostAttrs({ tokens: true })["data-tokens"]).toBe(true);
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

  it("multiline 写 data-multiline 与 rows", () => {
    expect(textFieldHostAttrs({})["data-multiline"]).toBeUndefined();
    expect(textFieldHostAttrs({}).rows).toBe(1);
    const attrs = textFieldHostAttrs({ multiline: true, rows: 1 });
    expect(attrs["data-multiline"]).toBe(true);
    expect(attrs.rows).toBe(1);
    expect(textFieldHostAttrs({ multiline: true, type: "number" })["data-width"]).toBe("hug");
    expect(textFieldHostAttrs({ multiline: true, rows: 1, value: "a\nb\nc" }).rows).toBe(1);
    expect(textFieldHostAttrs({ multiline: true, rows: 1 }).maxRows).toBe(6);
    expect(
      textFieldHostAttrs({
        multiline: true,
        rows: 1,
        maxRows: 4,
        value: "1\n2\n3\n4\n5",
      }).maxRows,
    ).toBe(4);
  });

  it("font=mono 才写 data-font", () => {
    expect(textFieldHostAttrs({})["data-font"]).toBeUndefined();
    expect(textFieldHostAttrs({ font: "ui" })["data-font"]).toBeUndefined();
    expect(textFieldHostAttrs({ font: "mono" })["data-font"]).toBe("mono");
  });

  it("type=number 写 data-stepper；multiline 不写", () => {
    expect(textFieldHostAttrs({})["data-stepper"]).toBeUndefined();
    expect(textFieldHostAttrs({ type: "number" })["data-stepper"]).toBe(true);
    expect(textFieldHostAttrs({ type: "number", multiline: true })["data-stepper"]).toBeUndefined();
  });

  it("步进钮：禁用/只读/触边关掉对应方向", () => {
    expect(textFieldStepperState({ type: "text" }).show).toBe(false);
    const idle = textFieldStepperState({ type: "number", value: "5", min: 0, max: 10 });
    expect(idle).toEqual({ show: true, incrementDisabled: false, decrementDisabled: false });
    expect(textFieldStepperState({ type: "number", value: "0", min: 0 }).decrementDisabled).toBe(true);
    expect(textFieldStepperState({ type: "number", value: "10", max: 10 }).incrementDisabled).toBe(true);
    expect(textFieldStepperState({ type: "number", value: "1", disabled: true }).incrementDisabled).toBe(true);
    expect(textFieldStepperState({ type: "number", value: "1", readOnly: true }).decrementDisabled).toBe(true);
  });
});
