import { describe, expect, it } from "vitest";

import { migrateLanding, migrateLocalOrigin, migrateLocalPoint, migrateReturnDelta } from "./migrate-place";

describe("migrate-place", () => {
  const root = {
    left: 100,
    top: 40,
    width: 192,
    height: 96,
    offsetWidth: 200,
    offsetHeight: 100,
  };

  it("视口差按对话框 scale 还原成布局像素", () => {
    expect(migrateLocalOrigin(root, { left: 196, top: 88, width: 10, height: 10 })).toEqual({
      x: 100,
      y: 50,
    });
    expect(migrateLocalPoint(root, 100, 40)).toEqual({ x: 0, y: 0 });
  });

  it("气泡中心贴上目标行中心", () => {
    expect(
      migrateLanding(
        { ...root, width: 200, height: 100, offsetWidth: 200, offsetHeight: 100 },
        { left: 100, top: 40, width: 160, height: 32, offsetWidth: 160, offsetHeight: 32 },
        { offsetWidth: 40, offsetHeight: 28 },
      ),
    ).toEqual({ x: 60, y: 2 });
  });

  it("放回位移是行相对预览宿主的差", () => {
    expect(migrateReturnDelta({ x: 180, y: 40 }, { x: 20, y: 64 })).toEqual({ x: -160, y: 24 });
  });
});