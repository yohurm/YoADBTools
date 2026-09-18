import { findChars, loweredChars } from "./chars";
import { normalizeSearchQuery, tokenizeSearchQuery } from "./token";
import type { SearchRange } from "./types";

export function mergeSearchRanges(ranges: readonly SearchRange[]): SearchRange[] {
  const sorted = ranges
    .filter((range) => range.end > range.start)
    .map((range) => ({ start: range.start, end: range.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (sorted.length === 0) return [];
  const out: SearchRange[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i]!;
    const last = out[out.length - 1]!;
    if (cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push({ ...cur });
  }
  return out;
}

function tokenRanges(text: string, token: string): SearchRange[] {
  const needle = normalizeSearchQuery(token);
  if (!needle) return [];
  const hay = loweredChars(text);
  const n = [...needle];
  const ranges: SearchRange[] = [];
  let from = 0;
  while (from <= hay.length) {
    const start = findChars(hay, n, from);
    if (start == null) break;
    const end = start + n.length;
    ranges.push({ start, end });
    from = start + Math.max(n.length, 1);
    if (from > hay.length) break;
  }
  return ranges;
}

export function searchHighlightRanges(text: string, query: string): SearchRange[] {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return [];
  return mergeSearchRanges(tokens.flatMap((token) => tokenRanges(text, token)));
}
