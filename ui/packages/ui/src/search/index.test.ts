import { describe, expect, it } from "vitest";

import * as search from "./index";

const ENGINE = [
  "createSearchEngine",
  "expandSearchGroups",
  "mergeSearchRanges",
  "normalizeSearchQuery",
  "searchDocuments",
  "searchFieldHit",
  "searchHighlightRanges",
  "tokenizeSearchQuery",
] as const;

const CHROME = ["YoSearch", "searchHostAttrs", "resolveSearchSlot"] as const;

describe("YoSearch 模块公开面", () => {
  it("引擎与铬分槽导出，不泄漏 chars", () => {
    for (const name of ENGINE) {
      expect(typeof (search as Record<string, unknown>)[name], name).toBe("function");
    }
    for (const name of CHROME) {
      expect(typeof (search as Record<string, unknown>)[name], name).toBe("function");
    }
    expect((search as Record<string, unknown>).loweredChars).toBeUndefined();
    expect((search as Record<string, unknown>).findChars).toBeUndefined();
    expect((search as Record<string, unknown>).findPinyinSpan).toBeUndefined();
    expect((search as Record<string, unknown>).kindScore).toBeUndefined();
  });
});
