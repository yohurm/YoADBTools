import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { clampToRect } from "../placement/clamp";
import { Layout } from "../tokens/layout";
import { Spacing } from "../tokens/spacing";
import { FontSizes } from "../tokens/typography";
import { clampContextMenuPoint, estimateContextMenuHeight, estimateContextMenuWidth, placeSubmenu } from "./place";

describe("clampContextMenuPoint", () => {
  it("贴右下角时按标签宽夹进视口", () => {
    const labels = ["复制", "删除"];
    const viewport = { width: 800, height: 600 };
    const point = clampContextMenuPoint(2000, 2000, labels, viewport);
    const width = estimateContextMenuWidth(labels, viewport.width);
    expect(width).toBe(Spacing.Md * 2 + 2 * FontSizes.Body);
    expect(point.x).toBe(800 - width);
    expect(point.y).toBeLessThan(600);
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeGreaterThanOrEqual(0);
  });

  it("视口内原坐标保持", () => {
    expect(clampContextMenuPoint(40, 80, ["复制", "删除"], { width: 800, height: 600 })).toEqual({
      x: 40,
      y: 80,
    });
  });

  it("高度随条目增加", () => {
    expect(estimateContextMenuHeight(3)).toBeGreaterThan(estimateContextMenuHeight(1));
  });

  it("短标签跟字数，长标签停在内容帽与视口边距", () => {
    const short = estimateContextMenuWidth(["复制", "删除"], 800);
    const longer = estimateContextMenuWidth(["复制路径"], 800);
    expect(longer).toBeGreaterThan(short);
    expect(short).toBeLessThan(Layout.MenuMax);
    const huge = "令".repeat(40);
    expect(estimateContextMenuWidth([huge], 800)).toBe(Layout.MenuMax);
    expect(estimateContextMenuWidth([huge], 200)).toBe(200 - Spacing.Lg);
  });
});

describe("placeSubmenu", () => {
  it("贴在父项右侧，右侧不够时翻到左边", () => {
    const size = { width: 80, height: 40 };
    const right = placeSubmenu({ left: 100, top: 20, right: 160 }, size, { width: 800, height: 600 });
    expect(right).toEqual({ x: 160 - Spacing.Xs, y: 20 });
    const flipped = placeSubmenu({ left: 700, top: 20, right: 760 }, size, { width: 800, height: 600 });
    expect(flipped.x).toBe(700 - size.width + Spacing.Xs);
    expect(flipped.y).toBe(20);
  });
});

describe("clampToRect", () => {
  it("贴边更宽条目：按实测宽高二次夹紧", () => {
    const point = clampToRect(2000, 2000, { width: 600, height: 300 }, { width: 800, height: 600 });
    expect(point.x).toBe(200); // 800 - 600
    expect(point.y).toBe(300); // 600 - 300
  });

  it("估算窄于实测时，二次夹紧把 x 收回来不出右缘", () => {
    const labels = ["复制"];
    const est = clampContextMenuPoint(2000, 2000, labels, { width: 800, height: 600 });
    const fixed = clampToRect(est.x, est.y, { width: 600, height: 300 }, { width: 800, height: 600 });
    expect(est.x).toBe(800 - estimateContextMenuWidth(labels, 800));
    expect(est.x).toBeGreaterThan(200);
    expect(fixed.x).toBe(200);
    expect(fixed.x + 600).toBeLessThanOrEqual(800);
  });

  it("视口内原坐标保持", () => {
    expect(clampToRect(40, 80, { width: 200, height: 100 }, { width: 800, height: 600 })).toEqual({
      x: 40,
      y: 80,
    });
  });

  it("尺寸大于视口时贴 0（全屏滚动兜底）", () => {
    expect(clampToRect(50, 50, { width: 1200, height: 900 }, { width: 800, height: 600 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("夹紧分量", () => {
  it("尺寸、原点和剩余限度必填不小于 0", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "placement", "clamp.ts"),
      "utf8",
    );
    const times = (needle: string): number => source.split(needle).length - 1;
    expect(times("Math.max(0, " + "size)")).toBe(0);
    expect(times("Math.max(0, " + "origin)")).toBe(0);
    expect(times("Math.max(0, " + "limit - span)")).toBe(0);
    expect(source).toContain("spanExtent(size)");
    expect(source).toContain("spanExtent(origin)");
    expect(source).toContain("spanExtent(limit - span)");
    expect(times("function spanExtent")).toBe(1);
    expect(times("return Math.max(0, value)")).toBe(1);
    expect(source).toContain("export function clampSpan");
    expect(source).toContain("export function clampToRect");
  });
});
