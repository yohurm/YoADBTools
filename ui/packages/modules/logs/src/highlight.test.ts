import { describe, expect, it } from "vitest";

import { containsAsciiIgnoreCase } from "./filter";
import { keywordRanges, keywordRangesInWindows } from "./highlight";

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
