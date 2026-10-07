import { readdirSync, readFileSync } from "node:fs";
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
  levelKey,
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
    expect(levelKey(letter)).toBe(letter.toLowerCase());
    expect(levelKey(letter.toLowerCase())).toBe(letter.toLowerCase());
  });
  it("拒绝空、多字符、未知", () => {
    expect(isLogLevelLetter("")).toBe(false);
    expect(isLogLevelLetter("VV")).toBe(false);
    expect(isLogLevelLetter("?")).toBe(false);
    expect(levelKey("")).toBeNull();
    expect(levelKey("VV")).toBeNull();
    expect(levelKey("?")).toBeNull();
    expect(normalizeLevels(["i", "W", "i", "?"])).toEqual(["I", "W"]);
  });
});

describe("ASCII 折叠只写一次", () => {
  it("A–Z 折成 a–z 只在 foldAscii", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const owner = readFileSync(resolve(here, "log-filter.ts"), "utf8");
    expect(owner).toContain("return code >= 65 && code <= 90 ? code + 32 : code;");
    const files = readdirSync(here).filter((name) => name.endsWith(".ts") && !name.includes(".test."));
    for (const name of files) {
      let body = readFileSync(resolve(here, name), "utf8");
      if (name === "log-filter.ts") {
        body = body.replace("return code >= 65 && code <= 90 ? code + 32 : code;", "");
      }
      expect(body, name).not.toContain(">= 65");
      expect(body, name).not.toContain("+ 32");
    }
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
