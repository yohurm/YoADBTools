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

  it("缺省宿主是 EMPHASIZED，不写 paint / variant", () => {
    expect(buttonHostAttrs({})).toEqual({
      "data-style": "emphasized",
      "data-tone": "accent",
      "data-size": "md",
      disabled: false,
      "aria-busy": undefined,
    });
  });

  it("textual + neutral 只写 style/tone，没有 data-paint", () => {
    const attrs = buttonHostAttrs({
      buttonStyle: "textual",
      tone: "neutral",
    });
    expect(attrs["data-style"]).toBe("textual");
    expect(attrs).not.toHaveProperty("data-paint");
    expect(attrs).not.toHaveProperty("data-variant");
  });

  it("normal + neutral 是鸿蒙普通按钮", () => {
    const attrs = buttonHostAttrs({ buttonStyle: "normal", tone: "neutral" });
    expect(attrs["data-style"]).toBe("normal");
    expect(attrs["data-tone"]).toBe("neutral");
    expect(attrs.disabled).toBe(false);
  });

  it("block 才写 data-block", () => {
    expect(buttonHostAttrs({})).not.toHaveProperty("data-block");
    expect(buttonHostAttrs({ block: true })["data-block"]).toBe(true);
  });

  it("loading 写入 disabled 与 aria-busy", () => {
    const attrs = buttonHostAttrs({ loading: true, tone: "danger", size: "sm" });
    expect(attrs.disabled).toBe(true);
    expect(attrs["aria-busy"]).toBe(true);
    expect(attrs["data-style"]).toBe("emphasized");
    expect(attrs["data-size"]).toBe("sm");
  });
});
