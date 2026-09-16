import { describe, expect, it } from "vitest";
import {
  iconButtonHostAttrs,
  resolveIconButtonAriaPressed,
  resolveIconButtonInteractive,
} from "./icon-button-policy";

describe("icon-button-policy", () => {
  it("默认可点且不报 busy", () => {
    expect(resolveIconButtonInteractive({})).toEqual({
      disabled: false,
      busy: false,
      pressed: false,
    });
  });

  it("disabled 关掉输入", () => {
    expect(resolveIconButtonInteractive({ disabled: true })).toEqual({
      disabled: true,
      busy: false,
      pressed: false,
    });
  });

  it("loading 同时禁用并报 busy", () => {
    expect(resolveIconButtonInteractive({ loading: true })).toEqual({
      disabled: true,
      busy: true,
      pressed: false,
    });
  });

  it("缺省宿主是 md 透明钮，没有 paint", () => {
    expect(iconButtonHostAttrs({ hasIcon: true })).toEqual({
      "data-size": "md",
      "data-pressed": undefined,
      "data-busy": undefined,
      disabled: false,
      "aria-busy": undefined,
      "aria-pressed": undefined,
    });
  });

  it("pressed 写入 data-pressed 与 aria-pressed", () => {
    const attrs = iconButtonHostAttrs({ hasIcon: true, pressed: true });
    expect(attrs["data-pressed"]).toBe("");
    expect(attrs["aria-pressed"]).toBe(true);
  });

  it("显式 aria-pressed 不带动画按下铬", () => {
    expect(resolveIconButtonAriaPressed({ ariaPressed: true })).toBe(true);
    const attrs = iconButtonHostAttrs({ hasIcon: true, ariaPressed: true });
    expect(attrs["aria-pressed"]).toBe(true);
    expect(attrs["data-pressed"]).toBeUndefined();
  });

  it("loading 写入 disabled 与 aria-busy", () => {
    const attrs = iconButtonHostAttrs({ hasIcon: true, loading: true, size: "sm" });
    expect(attrs.disabled).toBe(true);
    expect(attrs["aria-busy"]).toBe(true);
    expect(attrs["data-busy"]).toBe("");
    expect(attrs["data-size"]).toBe("sm");
  });
});
