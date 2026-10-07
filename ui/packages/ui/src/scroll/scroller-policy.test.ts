import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  resolveScrollerAxis,
  resolveScrollerBarState,
  resolveScrollerInteractive,
} from "./scroller-model";
import {
  scrollerHostAttrs,
  scrollerKeyAction,
  scrollerLaneAttrs,
  scrollerStealsKeys,
  scrollerThumbAttrs,
} from "./scroller-policy";

describe("scroller-policy", () => {
  it("宿主写 BarState 与相位，Off 交互关掉手势", () => {
    expect(
      scrollerHostAttrs("none", resolveScrollerBarState(), resolveScrollerInteractive(), resolveScrollerAxis()),
    ).toEqual({ "data-bar": "auto" });
    expect(scrollerHostAttrs("on", "on", true, "block")).toEqual({ "data-scroll": "on", "data-bar": "on" });
    expect(scrollerHostAttrs("on", "auto", true, "block", true)).toEqual({
      "data-scroll": "on",
      "data-bar": "auto",
      "data-gutter": "on",
    });
    expect(scrollerHostAttrs("in", "auto", false, "block")).toEqual({
      "data-scroll": "in",
      "data-bar": "auto",
      "data-interactive": "off",
    });
    expect(scrollerHostAttrs("on", "auto", true, "both", true, true, "in")).toEqual({
      "data-scroll": "on",
      "data-scroll-inline": "in",
      "data-bar": "auto",
      "data-gutter": "on",
      "data-gutter-inline": "on",
      "data-axis": "both",
    });
    expect(scrollerLaneAttrs("none")).toEqual({ "data-lane": "off" });
    expect(scrollerLaneAttrs("on")).toEqual({ "data-lane": "on" });
    expect(scrollerThumbAttrs(false)).toEqual({ "data-pressed": undefined });
    expect(scrollerThumbAttrs(true)).toEqual({ "data-pressed": "" });
  });

  it("条状态、交互、轴向缺省不在策略参数里再判", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "scroller-policy.ts"), "utf8");
    expect(body).not.toContain('= "auto"');
    expect(body).not.toContain("interactive = true");
    expect(body).not.toContain('= "block"');
  });

  it("跳过动效的相位不在两轴里各写一份", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    for (const name of ["scroller-binder.ts", "scroller-model.ts"]) {
      const body = readFileSync(join(root, name), "utf8");
      expect(body, name).not.toContain('shown ? "on" : "none"');
      expect(body, name).not.toContain('shown ? "on" : undefined');
    }
  });

  it("视口翻页键走 Page/Home/End", () => {
    expect(scrollerKeyAction("PageDown")).toBe("pageNext");
    expect(scrollerKeyAction("PageUp")).toBe("pagePrev");
    expect(scrollerKeyAction("Home")).toBe("start");
    expect(scrollerKeyAction("End")).toBe("end");
    expect(scrollerKeyAction("ArrowDown")).toBeUndefined();
  });

  it("首尾只认列表端点", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    for (const name of ["scroller-policy.ts", "scroller-binder.ts"]) {
      const body = readFileSync(join(root, name), "utf8");
      expect(body, name).not.toContain('"start" | "end"');
      expect(body, name).not.toContain('action === "start"');
    }
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
