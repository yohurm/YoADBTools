import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  cleanupSwapGeneration,
  holdSwapSession,
  isSwapWidthTransitionEnd,
  releaseSwapSession,
  resolveSwapKeyAdvance,
  resolveSwapToWidth,
  swapAdvanceIsSame,
  swapClipWidth,
  swapHostAttrs,
} from "./swap-policy";

describe("swap-policy", () => {
  it("finish / skip / 同 key 早退都归还 clipW", () => {
    const idle = releaseSwapSession();
    expect(idle).toEqual({ clipW: undefined, resizing: false });
    expect(resolveSwapKeyAdvance("预览", "预览")).toEqual({ kind: "same", key: "预览" });
    expect(swapHostAttrs("center", idle)).toEqual({
      "data-anchor": "center",
      "data-phase": "idle",
      "data-resizing": undefined,
    });
    expect(swapClipWidth(idle.clipW)).toBeUndefined();
  });

  it("cleanup 升代并归还 clipW", () => {
    const next = cleanupSwapGeneration(3);
    expect(next.gen).toBe(4);
    expect(next.clipW).toBeUndefined();
    expect(next.resizing).toBe(false);
  });

  it("keys 变化才开新代，先锁旧宽再插到新宽", () => {
    expect(resolveSwapKeyAdvance("", "预览")).toEqual({
      kind: "change",
      prevKey: "",
      nextKey: "预览",
    });
    expect(holdSwapSession(40)).toEqual({ clipW: 40, resizing: false });
    expect(resolveSwapToWidth(40, 80)).toEqual({ clipW: 80, resizing: true });
    expect(resolveSwapToWidth(40, 40.2)).toEqual({ clipW: undefined, resizing: false });
  });

  it("默认锚 end；hold 已是 resizing 相，插值才挂 data-resizing", () => {
    expect(swapHostAttrs(undefined, releaseSwapSession())["data-anchor"]).toBe("end");
    expect(swapHostAttrs(undefined, holdSwapSession(40))).toEqual({
      "data-anchor": "end",
      "data-phase": "resizing",
      "data-resizing": undefined,
    });
    expect(swapHostAttrs("start", resolveSwapToWidth(40, 80))).toEqual({
      "data-anchor": "start",
      "data-phase": "resizing",
      "data-resizing": "",
    });
    expect(swapClipWidth(80)).toBe("80px");
  });

  it("只认 clip 上的 width 过渡结束", () => {
    const clip = { id: "clip" };
    expect(isSwapWidthTransitionEnd("width", clip, clip)).toBe(true);
    expect(isSwapWidthTransitionEnd("height", clip, clip)).toBe(false);
    expect(isSwapWidthTransitionEnd("width", { id: "other" }, clip)).toBe(false);
  });

  it("同 key 只判一次", () => {
    expect(swapAdvanceIsSame({ kind: "same", key: "预览" })).toBe(true);
    expect(swapAdvanceIsSame({ kind: "change", prevKey: "", nextKey: "预览" })).toBe(false);
  });
});

describe("换牌身份只在策略判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("视图不再比较 advance.kind", () => {
    for (const name of ["swap-policy.ts", "swap.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      body = body.replaceAll('return advance.kind === "same"', "");
      expect(body, name).not.toContain('advance.kind === "same"');
      expect(body, name).not.toContain('advance.kind === "change"');
    }
  });
});

describe("换牌套上槽宽", () => {
  it("锁旧宽与目标宽都经 swapApplyPaint", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "swap.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("setResizing(hold." + "resizing)")).toBe(0);
    expect(count("setClipW(hold." + "clipW)")).toBe(0);
    expect(count("setResizing(next." + "resizing)")).toBe(0);
    expect(count("setClipW(next." + "clipW)")).toBe(0);
    expect(count("function swapApplyPaint")).toBe(1);
    expect(count("export function swapApplyPaint")).toBe(0);
    expect(count("setResizing(paint.resizing)")).toBe(2);
    expect(count("setClipW(paint.clipW)")).toBe(1);
    expect(count("setClipW(undefined)")).toBe(1);
    expect(count("swapApplyPaint(setResizing, setClipW, hold)")).toBe(1);
    expect(count("swapApplyPaint(setResizing, setClipW, next)")).toBe(1);
  });
});

describe("换牌读固有宽", () => {
  it("三处固有宽都经 swapWidth", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "swap.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("clipEl." + "offsetWidth")).toBe(0);
    expect(count("clip." + "offsetWidth")).toBe(0);
    expect(count("inner." + "offsetWidth")).toBe(0);
    expect(count(".offsetWidth")).toBe(1);
    expect(count("function swapWidth")).toBe(1);
    expect(count("export function swapWidth")).toBe(0);
    expect(count("return el.offsetWidth")).toBe(1);
    expect(count("swapWidth(clipEl)")).toBe(1);
    expect(count("swapWidth(clip)")).toBe(1);
    expect(count("swapWidth(inner)")).toBe(1);
    expect(count("function swapApplyPaint")).toBe(1);
    expect(count("swapApplyPaint(setResizing, setClipW, hold)")).toBe(1);
    expect(count("swapApplyPaint(setResizing, setClipW, next)")).toBe(1);
    expect(count("setClipW(undefined)")).toBe(1);
  });
});

describe("换牌换上目标文案", () => {
  it("两处换上目标文案都经 swapShowIncoming", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "swap.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("setView(() => " + "incoming)")).toBe(1);
    expect(count("function swapShowIncoming")).toBe(1);
    expect(count("export function swapShowIncoming")).toBe(0);
    expect(count("swapShowIncoming(setView, incoming)")).toBe(2);
    expect(count("function swapWidth")).toBe(1);
    expect(count("swapWidth(clipEl)")).toBe(1);
    expect(count("swapWidth(clip)")).toBe(1);
    expect(count("swapWidth(inner)")).toBe(1);
    expect(count(".offsetWidth")).toBe(1);
    expect(count("setClipW(undefined)")).toBe(1);
  });
});

describe("换牌清掉安全定时器", () => {
  it("两处清定时器都经 swapClearTimer", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "swap.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    const clearStart = body.indexOf("function swapClearTimer");
    const clearFn = body.slice(clearStart, body.indexOf("}", clearStart));
    expect(count("window.clearTimeout(" + "timer)")).toBe(1);
    expect(count("function swapClearTimer")).toBe(1);
    expect(count("export function swapClearTimer")).toBe(0);
    expect(count("swapClearTimer(timer)")).toBe(2);
    expect(count("finish()")).toBe(1);
    expect(clearFn).not.toContain("finish()");
    expect(count("function swapShowIncoming")).toBe(1);
    expect(count("swapShowIncoming(setView, incoming)")).toBe(2);
    expect(count("setView(() => " + "incoming)")).toBe(1);
    expect(count("function swapWidth")).toBe(1);
    expect(count("setClipW(undefined)")).toBe(1);
  });
});

describe("换牌停掉测宽", () => {
  it("两处停测宽都经 swapStopMeasure", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "swap.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("measureAfterSwap = " + "false")).toBe(2);
    expect(count("let measureAfterSwap = false")).toBe(1);
    expect(count("measureAfterSwap = true")).toBe(1);
    expect(count("function swapStopMeasure")).toBe(1);
    expect(count("export function swapStopMeasure")).toBe(0);
    expect(count("swapStopMeasure()")).toBe(3);
    expect(body).toContain("function swapClearTimer");
    expect(count("swapClearTimer(timer)")).toBe(2);
    expect(count("window.clearTimeout(" + "timer)")).toBe(1);
    expect(count("finish()")).toBe(1);
    expect(count("setClipW(undefined)")).toBe(1);
  });
});
