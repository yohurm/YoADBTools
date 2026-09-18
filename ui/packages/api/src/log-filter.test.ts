import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { LogFilter, LogLine } from "./types";
import {
  LEVELS,
  isLogLevelLetter,
  logFilterMatches,
  matchesWireFilter,
  normalizeLevels,
  parseLevelLetter,
} from "./log-filter";

const root = dirname(fileURLToPath(import.meta.url));

describe("LEVELS（与 domain testdata/log_levels.json 同一套向量）", () => {
  const letters = JSON.parse(
    readFileSync(resolve(root, "../../../../core/yohu-domain/testdata/log_levels.json"), "utf8"),
  ) as string[];
  it("字母表一致", () => {
    expect(letters).toEqual([...LEVELS]);
  });
  it.each(letters)("isLogLevelLetter %s", (letter) => {
    expect(isLogLevelLetter(letter)).toBe(true);
    expect(isLogLevelLetter(letter.toLowerCase())).toBe(true);
    expect(parseLevelLetter(letter)).toBe(letter);
  });
  it("拒绝空、多字符、未知", () => {
    expect(isLogLevelLetter("")).toBe(false);
    expect(isLogLevelLetter("VV")).toBe(false);
    expect(isLogLevelLetter("?")).toBe(false);
    expect(normalizeLevels(["i", "W", "i", "?"])).toEqual(["I", "W"]);
  });
});

describe("logFilterMatches（与 domain testdata/log_filter.json 同一套向量）", () => {
  const fixture = JSON.parse(
    readFileSync(resolve(root, "../../../../core/yohu-domain/testdata/log_filter.json"), "utf8"),
  ) as { line: LogLine; filter: LogFilter; expect: boolean }[];

  it.each(fixture)("case %#", (c) => {
    expect(logFilterMatches(c.filter, c.line)).toBe(c.expect);
    expect(matchesWireFilter(c.line, c.filter)).toBe(c.expect);
  });
});
