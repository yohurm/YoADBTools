import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { cssPointFromPhysical, hostPixelRatio, pointInRect, positiveScale } from "./pointer";

/** 生产源禁读这一句。测试源码里的针先剥掉。不扫 pointer.ts。 */
const HOST_RATIO_NEEDLE = "window.devicePixelRatio";

function moduleSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...moduleSources(path));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

describe("cssPointFromPhysical", () => {
  it("物理点除以 scale；scale≤0 当 1", () => {
    expect(cssPointFromPhysical(200, 100, 2)).toEqual({ x: 100, y: 50 });
    expect(cssPointFromPhysical(10, 20, 0)).toEqual({ x: 10, y: 20 });
  });
});

describe("hostPixelRatio", () => {
  it("等于 positiveScale(window.devicePixelRatio)", () => {
    expect(hostPixelRatio()).toBe(positiveScale(window.devicePixelRatio));
  });

  it("文件、终端、投屏生产源不再读 window.devicePixelRatio", () => {
    const modulesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../modules");
    const roots = ["files", "terminal", "mirror"].map((name) => resolve(modulesRoot, name, "src"));
    const offenders = roots.flatMap((root) =>
      moduleSources(root).filter((file) => {
        let text = readFileSync(file, "utf8");
        if (file.includes(".test.")) text = text.replaceAll(HOST_RATIO_NEEDLE, "");
        return text.includes(HOST_RATIO_NEEDLE);
      }),
    );
    expect(offenders).toEqual([]);
  });
});

describe("pointInRect", () => {
  const rect = { left: 0, top: 0, right: 100, bottom: 80 };

  it("边界含在矩形内", () => {
    expect(pointInRect(rect, 0, 0)).toBe(true);
    expect(pointInRect(rect, 100, 80)).toBe(true);
    expect(pointInRect(rect, 101, 20)).toBe(false);
  });
});
