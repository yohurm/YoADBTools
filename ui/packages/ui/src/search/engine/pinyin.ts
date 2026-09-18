/** 汉字拼音命中。音节表与 core/yohu-search/data/pinyin.tsv 同一份。不进模块公开面。 */

import { PINYIN_TSV } from "./pinyin-table";

type PinyinDict = {
  syllables: string[];
  byChar: Map<string, number[]>;
};

function parseDict(tsv: string): PinyinDict {
  const syllables: string[] = [];
  const byChar = new Map<string, number[]>();
  const index = new Map<string, number>();
  for (const line of tsv.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const syl = line.slice(0, tab);
    const chars = line.slice(tab + 1);
    if (!syl || !/^[a-z]+$/.test(syl)) continue;
    let id = index.get(syl);
    if (id == null) {
      id = syllables.length;
      index.set(syl, id);
      syllables.push(syl);
    }
    for (const ch of chars) {
      const ids = byChar.get(ch) ?? [];
      if (!ids.includes(id)) ids.push(id);
      byChar.set(ch, ids);
    }
  }
  return { syllables, byChar };
}

let cached: PinyinDict | undefined;

function dict(): PinyinDict {
  cached ??= parseDict(PINYIN_TSV);
  return cached;
}

export function isPinyinQuery(token: string): boolean {
  let letter = false;
  for (const ch of token) {
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z")) letter = true;
    else if (ch !== "'") return false;
  }
  return letter;
}

function needleChars(token: string): string[] {
  return [...token].filter((ch) => ch !== "'");
}

function prefixLen(syl: string, needle: readonly string[], ni: number): number {
  const rest = needle.length - ni;
  let n = 0;
  for (const ch of syl) {
    if (n >= rest || ch !== needle[ni + n]) break;
    n += 1;
  }
  return n;
}

function consume(
  hay: readonly string[],
  hi: number,
  needle: readonly string[],
  ni: number,
  table: PinyinDict,
): number | null {
  if (ni === needle.length) return hi;
  if (hi >= hay.length) return null;
  const ch = hay[hi]!;
  if (isAsciiLetter(ch)) {
    return ch === needle[ni] ? consume(hay, hi + 1, needle, ni + 1, table) : null;
  }
  const ids = table.byChar.get(ch);
  if (ids) {
    for (const id of ids) {
      const syl = table.syllables[id]!;
      const max = prefixLen(syl, needle, ni);
      for (let k = 1; k <= max; k += 1) {
        const end = consume(hay, hi + 1, needle, ni + k, table);
        if (end != null) return end;
      }
    }
    return null;
  }
  return consume(hay, hi + 1, needle, ni, table);
}

function isAsciiLetter(ch: string): boolean {
  return ch.length === 1 && ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z"));
}

function findFrom(
  hay: readonly string[],
  needle: readonly string[],
  from: number,
  table: PinyinDict,
): [number, number] | null {
  if (needle.length === 0) return null;
  let start = from;
  while (start < hay.length) {
    const ch = hay[start]!;
    if (!isAsciiLetter(ch) && !table.byChar.has(ch)) {
      start += 1;
      continue;
    }
    const end = consume(hay, start, needle, 0, table);
    if (end != null && end > start) return [start, end];
    start += 1;
  }
  return null;
}

/** 字段里第一次拼音命中。`token` 已小写。无汉字或非拼音查询则空。 */
export function findPinyinSpan(
  hay: readonly string[],
  token: string,
  from: number,
): [number, number] | null {
  const table = dict();
  if (!isPinyinQuery(token) || !hay.some((ch) => table.byChar.has(ch))) return null;
  return findFrom(hay, needleChars(token), from, table);
}
