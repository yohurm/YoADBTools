import { describe, expect, it } from "vitest";
import { buttonHostAttrs } from "./button-policy";

describe("button-policy", () => {
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
    expect(buttonHostAttrs({})["data-block"]).toBeUndefined();
    expect(buttonHostAttrs({ block: true })["data-block"]).toBe("");
  });

  it("loading 写入 disabled 与 aria-busy", () => {
    const attrs = buttonHostAttrs({ loading: true, tone: "danger", size: "sm" });
    expect(attrs.disabled).toBe(true);
    expect(attrs["aria-busy"]).toBe(true);
    expect(attrs["data-style"]).toBe("emphasized");
    expect(attrs["data-size"]).toBe("sm");
  });
});
