import { findChars, loweredChars } from "./chars";
import { findPinyinSpan } from "./pinyin";
import { normalizeSearchQuery } from "./token";
import type { SearchHit, SearchHitKind } from "./types";

function isBoundary(ch: string | undefined): boolean {
  return ch == null || /\s/u.test(ch);
}

function spanKind(hay: readonly string[], start: number, end: number): SearchHitKind {
  if (start === 0 && end === hay.length) return "exact";
  if (start === 0 || isBoundary(hay[start - 1])) return "prefix";
  return "contains";
}

/** 字段对单语的第一次命中。下标是 Unicode 标量。 */
export function searchFieldHit(text: string, token: string): SearchHit | null {
  const needle = normalizeSearchQuery(token);
  if (!needle) return null;
  const hay = loweredChars(text);
  const n = [...needle];
  const start = findChars(hay, n, 0);
  if (start != null) return { field: "", start, end: start + n.length, kind: spanKind(hay, start, start + n.length) };
  const span = findPinyinSpan(hay, needle, 0);
  if (!span) return null;
  return { field: "", start: span[0], end: span[1], kind: spanKind(hay, span[0], span[1]) };
}
