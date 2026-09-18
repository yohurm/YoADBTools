import { findChars, loweredChars } from "./chars";
import { normalizeSearchQuery } from "./token";
import type { SearchHit, SearchHitKind } from "./types";

function isBoundary(ch: string | undefined): boolean {
  return ch == null || /\s/u.test(ch);
}

function hitKind(hay: readonly string[], needle: readonly string[], index: number): SearchHitKind {
  if (hay.length === needle.length && hay.every((ch, i) => ch === needle[i])) return "exact";
  if (index === 0 || isBoundary(hay[index - 1])) return "prefix";
  return "contains";
}

/** 字段对单语的第一次命中。下标是 Unicode 标量。 */
export function searchFieldHit(text: string, token: string): SearchHit | null {
  const needle = normalizeSearchQuery(token);
  if (!needle) return null;
  const hay = loweredChars(text);
  const n = [...needle];
  const start = findChars(hay, n, 0);
  if (start == null) return null;
  return { field: "", start, end: start + n.length, kind: hitKind(hay, n, start) };
}
