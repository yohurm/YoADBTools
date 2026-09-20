import { afterEach, describe, expect, it, vi } from "vitest";

import { measureVirtualViewContentWidth } from "./virtuallist-measure";

describe("virtuallist-measure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("无节点为 0", () => {
    expect(measureVirtualViewContentWidth(undefined)).toBe(0);
    expect(measureVirtualViewContentWidth(null)).toBe(0);
  });

  it("视口内容宽 = clientWidth 减 paddingInline", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 400 });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      paddingInlineStart: "8px",
      paddingInlineEnd: "8px",
    } as CSSStyleDeclaration);
    expect(measureVirtualViewContentWidth(el)).toBe(384);
  });

  it("padding 非法或负值不减出负数", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 400 });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      paddingInlineStart: "",
      paddingInlineEnd: "-4px",
    } as CSSStyleDeclaration);
    expect(measureVirtualViewContentWidth(el)).toBe(400);
  });
});
