import { describe, expect, it } from "vitest";
import {
  DEFAULT_SWAP_ANCHOR,
  SWAP_WIDTH_EPS,
  resolveSwapAnchor,
  shouldSkipSwap,
  swapPhase,
  swapWidthsSettled,
} from "./swap-model";

describe("swap-model", () => {
  it("默认锚是 end，缺省与显式 end 同一条", () => {
    expect(DEFAULT_SWAP_ANCHOR).toBe("end");
    expect(resolveSwapAnchor()).toBe("end");
    expect(resolveSwapAnchor("end")).toBe("end");
    expect(resolveSwapAnchor("center")).toBe("center");
    expect(resolveSwapAnchor("start")).toBe("start");
  });

  it("首键 / 减动效 / 未入树 / 复合节点都 skip", () => {
    const ready = {
      prevKey: "预览",
      skipMotion: false,
      attached: true,
      incomingText: "收起预览",
    };
    expect(shouldSkipSwap(ready)).toBe(false);
    expect(shouldSkipSwap({ ...ready, prevKey: "" })).toBe(true);
    expect(shouldSkipSwap({ ...ready, skipMotion: true })).toBe(true);
    expect(shouldSkipSwap({ ...ready, attached: false })).toBe(true);
    expect(shouldSkipSwap({ ...ready, incomingText: null })).toBe(true);
  });

  it("未锁宽是 idle，锁宽是 resizing", () => {
    expect(swapPhase(undefined)).toBe("idle");
    expect(swapPhase(48)).toBe("resizing");
  });

  it("槽宽贴目标只认 SWAP_WIDTH_EPS", () => {
    expect(swapWidthsSettled(40, 40)).toBe(true);
    expect(swapWidthsSettled(40, 40 + SWAP_WIDTH_EPS - 0.1)).toBe(true);
    expect(swapWidthsSettled(40, 40 + SWAP_WIDTH_EPS)).toBe(false);
    expect(swapWidthsSettled(80, 40)).toBe(false);
  });
});
