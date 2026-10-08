import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { washGrid, washPaint, washSpanOpen } from "./markup-wash";

function srcOf(name: string): string {
  return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), name), "utf-8");
}

describe("Markup BACKGROUND 文本节点字符格", () => {
  it("EXACT_RANGE：三格宽、字母在正中", () => {
    const grid = washGrid(10, 13);
    expect(grid).toEqual({ from: 10, span: 3 });
    expect(grid!.from + grid!.span / 2).toBe(11.5);
    expect(washGrid(10, 10)).toBeNull();
    const paint = washPaint([{ from: 10, to: 13, fill: "var(--yohu-level-i)" }]);
    expect(paint.size).toBe("calc(3 * 1ch) 100%");
    expect(paint.position).toBe("calc(10 * 1ch) 0");
    expect(paint.image).toContain("var(--yohu-level-i)");
    expect(washPaint([])).toEqual({
      image: "none",
      size: "0px 100%",
      position: "0 0",
    });
  });

  it("本层只认文档偏移×1ch，不建 DOM / 不回流 Formatter", () => {
    const src = srcOf("markup-wash.ts");
    expect(src).toContain("bindWashPaint");
    expect(src).toContain("washGrid");
    expect(src).toContain("washPaint");
    expect(src).toContain("1ch");
    expect(src).not.toContain("yohu-logs__wash");
    expect(src).not.toContain("bindWashCells");
    expect(src).not.toContain("bindWashRects");
    expect(src).not.toContain("washCell");
    expect(src).not.toContain("createElement");
    expect(src).not.toContain("prepend");
    expect(src).not.toContain("data-log-chrome");
    expect(src).not.toContain(".getBoundingClientRect");
    expect(src).not.toContain("createRange");
    expect(src).not.toContain("requestAnimationFrame");
    expect(src).not.toContain("chPx");
    expect(src).not.toContain("rowHeight");
    expect(src).not.toContain("./format");
    expect(src).not.toContain("./document");
    expect(src).not.toContain("./selection");
    expect(src).not.toContain("./markup-policy");
    expect(src).not.toContain("../highlight");
    expect(src).not.toContain("CSS.highlights");
    expect(src).not.toContain("FieldSpan");
  });

  it("空段只在几何里判一次", () => {
    expect(washSpanOpen(1, 2)).toBe(true);
    expect(washSpanOpen(2, 2)).toBe(false);
    expect(washSpanOpen(3, 1)).toBe(false);
    const root = dirname(fileURLToPath(import.meta.url));
    for (const name of ["markup-wash.ts", "markup-model.ts", "markup-registry.ts", "view.tsx"]) {
      let body = readFileSync(resolve(root, name), "utf8");
      if (name === "markup-wash.ts") body = body.replace("return from < to", "");
      expect(body, name).not.toContain("from < to");
      expect(body, name).not.toContain("to <= from");
      expect(body, name).not.toContain("to > from");
      expect(body, name).not.toContain("cell.to > cell.from");
      expect(body, name).not.toContain("range.end <= range.start");
    }
  });
});

describe("底色列表分隔只写一次", () => {
  it("css_list_once", () => {
    const src = srcOf("markup-wash.ts");
    const needle = '.join(", ' + '")';
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("cssList(");
  });
});
