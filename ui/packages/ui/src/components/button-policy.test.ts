import { describe, expect, it } from "vitest";
import { buttonHostAttrs, resolveButtonInteractive } from "./button-policy";

describe("button-policy", () => {
  it("默认可点且不报 busy", () => {
    expect(resolveButtonInteractive({})).toEqual({ disabled: false, busy: false });
  });

  it("disabled 关掉输入", () => {
    expect(resolveButtonInteractive({ disabled: true })).toEqual({ disabled: true, busy: false });
  });

  it("loading 同时禁用并报 busy", () => {
    expect(resolveButtonInteractive({ loading: true })).toEqual({ disabled: true, busy: true });
  });

  it("disabled 与 loading 同时出现仍禁用", () => {
    expect(resolveButtonInteractive({ disabled: true, loading: true })).toEqual({
      disabled: true,
      busy: true,
    });
  });

  it("缺省宿主属性是主按钮涂装", () => {
    expect(buttonHostAttrs({})).toEqual({
      "data-variant": "solid",
      "data-tone": "accent",
      "data-size": "md",
      "data-paint": "solid-on",
      disabled: false,
      "aria-busy": undefined,
    });
  });

  it("outlined + neutral 对应旧 secondary", () => {
    const attrs = buttonHostAttrs({ variant: "outlined", tone: "neutral" });
    expect(attrs["data-paint"]).toBe("outlined-neutral");
    expect(attrs.disabled).toBe(false);
  });

  it("loading 写入 disabled 与 aria-busy", () => {
    const attrs = buttonHostAttrs({ loading: true, tone: "danger", size: "sm" });
    expect(attrs.disabled).toBe(true);
    expect(attrs["aria-busy"]).toBe(true);
    expect(attrs["data-paint"]).toBe("solid-on");
    expect(attrs["data-size"]).toBe("sm");
  });
});
