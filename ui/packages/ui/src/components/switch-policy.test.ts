import { describe, expect, it } from "vitest";
import { resolveSwitchInteractive, switchHostAttrs, switchNextChecked } from "./switch-policy";

describe("switch-policy", () => {
  it("默认可点", () => {
    expect(resolveSwitchInteractive({})).toEqual({ disabled: false });
  });

  it("取反提交；禁用返回 null", () => {
    expect(switchNextChecked(false, false)).toBe(true);
    expect(switchNextChecked(true, false)).toBe(false);
    expect(switchNextChecked(false, true)).toBeNull();
    expect(switchNextChecked(true, true)).toBeNull();
  });

  it("缺省宿主属性是关闭 off", () => {
    expect(switchHostAttrs({})).toEqual({
      "data-checked": "false",
      "data-paint": "off",
      "data-disabled": undefined,
      disabled: false,
      "aria-checked": false,
    });
  });

  it("开启写入 data-paint=on 与 aria-checked", () => {
    const attrs = switchHostAttrs({ checked: true });
    expect(attrs["data-paint"]).toBe("on");
    expect(attrs["data-checked"]).toBe("true");
    expect(attrs["aria-checked"]).toBe(true);
  });

  it("disabled 写入 data-disabled，涂装仍跟开关", () => {
    const attrs = switchHostAttrs({ checked: true, disabled: true });
    expect(attrs.disabled).toBe(true);
    expect(attrs["data-disabled"]).toBe(true);
    expect(attrs["data-paint"]).toBe("on");
  });
});
