import { describe, expect, it } from "vitest";

import {
  scrollerHostAttrs,
  scrollerKeyAction,
  scrollerLaneAttrs,
  scrollerStealsKeys,
  scrollerThumbAttrs,
} from "./scroller-policy";

describe("scroller-policy", () => {
  it("宿主写 BarState 与相位，Off 交互关掉手势", () => {
    expect(scrollerHostAttrs("none")).toEqual({ "data-bar": "auto" });
    expect(scrollerHostAttrs("on", "on")).toEqual({ "data-scroll": "on", "data-bar": "on" });
    expect(scrollerHostAttrs("on", "auto", true, true)).toEqual({
      "data-scroll": "on",
      "data-bar": "auto",
      "data-gutter": "on",
    });
    expect(scrollerHostAttrs("in", "auto", false)).toEqual({
      "data-scroll": "in",
      "data-bar": "auto",
      "data-interactive": "off",
    });
    expect(scrollerLaneAttrs("none")).toEqual({ "data-lane": "off" });
    expect(scrollerLaneAttrs("on")).toEqual({ "data-lane": "on" });
    expect(scrollerThumbAttrs(false)).toEqual({});
    expect(scrollerThumbAttrs(true)).toEqual({ "data-pressed": "" });
  });

  it("视口翻页键走 Page/Home/End", () => {
    expect(scrollerKeyAction("PageDown")).toBe("pageNext");
    expect(scrollerKeyAction("PageUp")).toBe("pagePrev");
    expect(scrollerKeyAction("Home")).toBe("start");
    expect(scrollerKeyAction("End")).toBe("end");
    expect(scrollerKeyAction("ArrowDown")).toBeUndefined();
  });

  it("字段与列表焦点不抢翻页键", () => {
    const field = document.createElement("input");
    const host = document.createElement("div");
    host.append(field);
    expect(scrollerStealsKeys(field)).toBe(true);
    expect(scrollerStealsKeys(host)).toBe(false);
    expect(scrollerStealsKeys(null)).toBe(false);
    const option = document.createElement("div");
    option.setAttribute("role", "option");
    expect(scrollerStealsKeys(option)).toBe(true);
  });
});
