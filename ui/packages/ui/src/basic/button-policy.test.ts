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

  it("缺省宿主属性是主按钮涂装，不写 ink / flush", () => {
    expect(buttonHostAttrs({})).toEqual({
      "data-variant": "solid",
      "data-tone": "accent",
      "data-size": "md",
      "data-paint": "solid-on",
      disabled: false,
      "aria-busy": undefined,
    });
  });

  it("ghost + neutral 只写涂装，没有 data-ink / data-flush", () => {
    const attrs = buttonHostAttrs({
      variant: "ghost",
      tone: "neutral",
    });
    expect(attrs["data-paint"]).toBe("ghost-neutral");
    expect(attrs).not.toHaveProperty("data-ink");
    expect(attrs).not.toHaveProperty("data-flush");
  });

  it("outlined + neutral 对应旧 secondary", () => {
    const attrs = buttonHostAttrs({ variant: "outlined", tone: "neutral" });
    expect(attrs["data-paint"]).toBe("outlined-neutral");
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
    expect(attrs["data-paint"]).toBe("solid-on");
    expect(attrs["data-size"]).toBe("sm");
  });
});
