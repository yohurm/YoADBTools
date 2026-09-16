import { describe, expect, it } from "vitest";
import {
  cleanupSwapGeneration,
  holdSwapSession,
  isSwapWidthTransitionEnd,
  releaseSwapSession,
  resolveSwapKeyAdvance,
  resolveSwapToWidth,
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
      "data-resizing": "true",
    });
    expect(swapClipWidth(80)).toBe("80px");
  });

  it("只认 clip 上的 width 过渡结束", () => {
    const clip = { id: "clip" };
    expect(isSwapWidthTransitionEnd("width", clip, clip)).toBe(true);
    expect(isSwapWidthTransitionEnd("height", clip, clip)).toBe(false);
    expect(isSwapWidthTransitionEnd("width", { id: "other" }, clip)).toBe(false);
  });
});
