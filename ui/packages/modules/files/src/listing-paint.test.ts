import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  listingCacheKey,
  listingPaint,
  listingPaintIsCold,
  listingPaintIsEmpty,
  listingPaintIsFault,
  listingPaintIsRows,
} from "./listing-paint";

describe("listingPaint", () => {
  it("有行就画表，即使正在后台对账或这次失败", () => {
    expect(listingPaint(3, true, true, false)).toBe("rows");
    expect(listingPaint(1, true, false, false)).toBe("rows");
    expect(listingPaint(2, false, false, true)).toBe("rows");
  });

  it("无行且不在飞、没有失败，只表示空目录", () => {
    expect(listingPaint(0, false, false, false)).toBe("empty");
    expect(listingPaint(0, false, true, false)).toBe("empty");
  });

  it("冷启动才全屏 loading；导航 miss 是 pending；在飞不画失败", () => {
    expect(listingPaint(0, true, true, false)).toBe("cold");
    expect(listingPaint(0, true, false, false)).toBe("pending");
    expect(listingPaint(0, true, false, true)).toBe("pending");
  });

  it("失败且没有行才是 fault，不画成空目录", () => {
    expect(listingPaint(0, false, false, true)).toBe("fault");
    expect(listingPaint(0, false, true, true)).toBe("fault");
    expect(listingPaintIsFault("fault")).toBe(true);
    expect(listingPaintIsFault("empty")).toBe(false);
  });
});

describe("listingCacheKey", () => {
  it("串号与路径合成稳定键", () => {
    expect(listingCacheKey("S1", "/sdcard")).toBe("S1\0/sdcard");
    expect(listingCacheKey("S1", "/sdcard")).not.toBe(listingCacheKey("S2", "/sdcard"));
  });
});

describe("清单相位只在绘制模块判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("行、冷启动、空目录各判一次", () => {
    expect(listingPaintIsRows("rows")).toBe(true);
    expect(listingPaintIsCold("cold")).toBe(true);
    expect(listingPaintIsEmpty("empty")).toBe(true);
    expect(listingPaintIsRows("pending")).toBe(false);
    expect(listingPaintIsCold("empty")).toBe(false);
    expect(listingPaintIsEmpty("rows")).toBe(false);
  });

  it("表不再比较 paint 字面量", () => {
    for (const name of ["listing-paint.ts", "FileTable.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      body = body.replaceAll('return paint === "rows"', "");
      body = body.replaceAll('return paint === "cold"', "");
      body = body.replaceAll('return paint === "empty"', "");
      body = body.replaceAll('return paint === "fault"', "");
      expect(body, name).not.toContain('paint === "rows"');
      expect(body, name).not.toContain('paint === "cold"');
      expect(body, name).not.toContain('paint === "empty"');
      expect(body, name).not.toContain('paint === "pending"');
      expect(body, name).not.toContain('paint === "fault"');
      expect(body, name).not.toContain('paint() === "rows"');
      expect(body, name).not.toContain('paint() === "cold"');
      expect(body, name).not.toContain('paint() === "empty"');
      expect(body, name).not.toContain('paint() === "pending"');
    }
  });
});
