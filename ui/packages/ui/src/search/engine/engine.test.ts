import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  createSearchEngine,
  expandSearchGroups,
  normalizeSearchQuery,
  searchDocuments,
  searchFieldHit,
  searchHighlightRanges,
  tokenizeSearchQuery,
  type SearchDocument,
  type SearchHitKind,
  type SearchOptions,
  type SearchRange,
} from "./index";
import { PINYIN_TSV } from "./pinyin-table";

const testdata = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../core/yohu-search/testdata/search.json",
);
const pinyinTsv = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../core/yohu-search/data/pinyin.tsv",
);

type Fixture = {
  docs: SearchDocument[];
  tokenize: { query: string; normalized: string; tokens: string[] }[];
  field_hits: { text: string; token: string; kind?: SearchHitKind; start?: number; end?: number }[];
  search: { query: string; options?: SearchOptions; ids: string[]; score0?: number }[];
  expand: { query: string; ids: string[] }[];
  highlight: { text: string; query: string; ranges: SearchRange[] }[];
};

const fixture = JSON.parse(readFileSync(testdata, "utf8")) as Fixture;

describe("YoSearch 引擎（与 yohu-search testdata/search.json 同一套向量）", () => {
  it("拼音表与 core/yohu-search/data/pinyin.tsv 同一份", () => {
    expect(PINYIN_TSV.replace(/\r\n/g, "\n")).toBe(readFileSync(pinyinTsv, "utf8").replace(/\r\n/g, "\n"));
  });

  it.each(fixture.tokenize)("tokenize $query", (c) => {
    expect(normalizeSearchQuery(c.query)).toBe(c.normalized);
    expect(tokenizeSearchQuery(c.query)).toEqual(c.tokens);
  });

  it.each(fixture.field_hits)("field $text / $token", (c) => {
    const hit = searchFieldHit(c.text, c.token);
    if (c.kind == null) {
      expect(hit).toBeNull();
      return;
    }
    expect(hit?.kind).toBe(c.kind);
    expect(hit?.start).toBe(c.start);
    expect(hit?.end).toBe(c.end);
  });

  it.each(fixture.search)("search $query", (c) => {
    const matches = searchDocuments(fixture.docs, c.query, c.options ?? {});
    expect(matches.map((match) => match.id)).toEqual(c.ids);
    if (c.score0 != null) expect(matches[0]?.score).toBe(c.score0);
  });

  it.each(fixture.expand)("expand $query", (c) => {
    const expanded = expandSearchGroups(fixture.docs, searchDocuments(fixture.docs, c.query));
    expect(expanded.map((match) => match.id)).toEqual(c.ids);
  });

  it.each(fixture.highlight)("highlight $query", (c) => {
    expect(searchHighlightRanges(c.text, c.query)).toEqual(c.ranges);
  });

  it("createSearchEngine 冻结快照", () => {
    const live = fixture.docs.slice(0, 1);
    const engine = createSearchEngine(live);
    live.push(fixture.docs[1]!);
    expect(engine.search("ping")).toEqual([]);
    expect(engine.search("型号").map((match) => match.id)).toEqual(["c-model"]);
  });
});
