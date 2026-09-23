import { describe, expect, it } from "vitest";

import { listingCacheKey, listingPaint } from "./listing-paint";

describe("listingPaint", () => {
  it("有行就画表，即使正在后台对账", () => {
    expect(listingPaint(3, true, true)).toBe("rows");
    expect(listingPaint(1, true, false)).toBe("rows");
  });

  it("无行且不在飞只表示空目录", () => {
    expect(listingPaint(0, false, false)).toBe("empty");
    expect(listingPaint(0, false, true)).toBe("empty");
  });

  it("冷启动才全屏 loading；导航 miss 是 pending", () => {
    expect(listingPaint(0, true, true)).toBe("cold");
    expect(listingPaint(0, true, false)).toBe("pending");
  });
});

describe("listingCacheKey", () => {
  it("串号与路径合成稳定键", () => {
    expect(listingCacheKey("S1", "/sdcard")).toBe("S1\0/sdcard");
    expect(listingCacheKey("S1", "/sdcard")).not.toBe(listingCacheKey("S2", "/sdcard"));
  });
});
