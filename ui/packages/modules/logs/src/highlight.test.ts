import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { containsAsciiIgnoreCase } from "@yohu/api";
import { keywordBlank, keywordRanges, keywordRangesInWindows } from "./highlight";

describe("keywordRanges", () => {
  it("无关键字不标", () => {
    expect(keywordRanges("hello world", "")).toEqual([]);
  });

  it("忽略大小写标出偏移，前后原文仍在同一字符串", () => {
    expect(keywordRanges("Hello World", "world")).toEqual([{ from: 6, to: 11 }]);
    expect(keywordRanges("abcabc", "bc")).toEqual([
      { from: 1, to: 3 },
      { from: 4, to: 6 },
    ]);
  });

  it("非 ASCII 关键字与过滤同一套 ASCII 折叠，不用 toLowerCase", () => {
    const dotted = "prefix İstanbul";
    expect("İ".toLowerCase().length).toBeGreaterThan("İ".length);
    expect(containsAsciiIgnoreCase(dotted, "İ")).toBe(true);
    expect(keywordRanges(dotted, "İ")).toEqual([{ from: 7, to: 8 }]);

    const kelvin = "\u212A";
    expect(kelvin.toLowerCase()).toBe("k");
    expect(containsAsciiIgnoreCase("foo k bar", kelvin)).toBe(false);
    expect(keywordRanges("foo k bar", kelvin)).toEqual([]);
    expect(containsAsciiIgnoreCase(`foo ${kelvin} bar`, kelvin)).toBe(true);
    expect(keywordRanges(`foo ${kelvin} bar`, kelvin)).toEqual([{ from: 4, to: 5 }]);
  });

  it("只在消息窗口内标，不进级别列", () => {
    const text = " D hello D";
    expect(
      keywordRangesInWindows(
        text,
        [
          { start: 0, end: 3, kind: "level" },
          { start: 3, end: 10, kind: "msg" },
        ],
        "D",
      ),
    ).toEqual([{ from: 9, to: 10 }]);
  });
});

describe("空白关键字只判一次", () => {
  it("空串不标，生产路径不再写 !keyword", () => {
    expect(keywordBlank("")).toBe(true);
    expect(keywordBlank("a")).toBe(false);
    const root = dirname(fileURLToPath(import.meta.url));
    const walk = (dir: string): void => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(abs);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(ent.name) || ent.name.includes(".test.")) continue;
        let body = readFileSync(abs, "utf8");
        const name = abs.slice(root.length + 1).replaceAll("\\", "/");
        if (name === "highlight.ts") body = body.replace("return keyword.length === 0", "");
        expect(body, name).not.toContain("!keyword");
        expect(body, name).not.toContain("keyword.length === 0");
      }
    };
    walk(root);
  });
});
