/**
 * 日志过滤匹配。与 yohu-domain::log_filter 同一套 testdata/log_filter.json。
 * 级别字母单源 testdata/log_levels.json ↔ LEVELS。
 */

import type { LogFilter, LogLine, LogScope } from "./types";

export const LEVELS = ["V", "D", "I", "W", "E", "F"] as const;
export type LevelLetter = (typeof LEVELS)[number];

export function parseLevelLetter(level: string): LevelLetter | null {
  const upper = level.toUpperCase();
  return (LEVELS as readonly string[]).includes(upper) && upper.length === 1 ? (upper as LevelLetter) : null;
}

export function isLogLevelLetter(token: string): boolean {
  return parseLevelLetter(token) !== null;
}

/** 只保留 LEVELS，去重并按 V→F。空 = 不限级别。 */
export function normalizeLevels(input: readonly string[]): LevelLetter[] {
  const seen = new Set<LevelLetter>();
  for (const raw of input) {
    const letter = parseLevelLetter(raw);
    if (letter) seen.add(letter);
  }
  return LEVELS.filter((letter) => seen.has(letter));
}

export function parseTagNeedles(raw: string): string[] {
  if (!raw) return [];
  const needles: string[] = [];
  for (const part of raw.split(/[,，、;；|]/)) {
    const needle = part.trim();
    if (needle) needles.push(needle);
  }
  return needles;
}

export function tagFilterActive(raw: string): boolean {
  return parseTagNeedles(raw).length > 0;
}

/** ASCII 忽略大小写精确等价（已提交 Tag 针，不是子串；避免 libc 命中 libcomposer_ext）。 */
export function equalsAsciiIgnoreCase(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x === y) continue;
    const xl = x >= 65 && x <= 90 ? x + 32 : x;
    const yl = y >= 65 && y <= 90 ? y + 32 : y;
    if (xl !== yl) return false;
  }
  return true;
}

/** ASCII 忽略大小写前缀匹配（输入中草稿 Tag 针，如 GGEC- 命中 GGEC-DeviceEventRouter）。 */
export function startsWithAsciiIgnoreCase(haystack: string, prefix: string): boolean {
  if (prefix.length > haystack.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    const x = haystack.charCodeAt(i);
    const y = prefix.charCodeAt(i);
    if (x === y) continue;
    const xl = x >= 65 && x <= 90 ? x + 32 : x;
    const yl = y >= 65 && y <= 90 ? y + 32 : y;
    if (xl !== yl) return false;
  }
  return true;
}

/** ASCII 仅 A–Z 折叠后的子串起点；空针同 `String.indexOf`。 */
export function indexOfAsciiIgnoreCase(haystack: string, needle: string, from = 0): number {
  if (needle.length === 0) {
    if (from < 0) return 0;
    return from <= haystack.length ? from : haystack.length;
  }
  const start = from < 0 ? 0 : from;
  const n = needle.length;
  const last = haystack.length - n;
  outer: for (let i = start; i <= last; i++) {
    for (let j = 0; j < n; j++) {
      const a = haystack.charCodeAt(i + j);
      const b = needle.charCodeAt(j);
      if (a === b) continue;
      const al = a >= 65 && a <= 90 ? a + 32 : a;
      const bl = b >= 65 && b <= 90 ? b + 32 : b;
      if (al !== bl) continue outer;
    }
    return i;
  }
  return -1;
}

const TAG_TRAILING_SEP = /[,，、;；|]\s*$/;

/** 拆解为已提交针（精确匹配）与当前草稿针（前缀匹配；尾部有分隔符则无草稿）。 */
export function parseTagFilterNeedles(spec: string): { committed: string[]; draft: string } {
  const needles = parseTagNeedles(spec);
  if (needles.length === 0) return { committed: [], draft: "" };
  if (TAG_TRAILING_SEP.test(spec)) return { committed: needles, draft: "" };
  return { committed: needles.slice(0, -1), draft: needles[needles.length - 1]! };
}

/** 空针不限；已提交针精确命中，正在输入的草稿针前缀命中（打字实时匹配且避免 libc 误伤）。 */
export function tagAllowed(lineTag: string, spec: string): boolean {
  const { committed, draft } = parseTagFilterNeedles(spec);
  if (committed.length === 0 && !draft) return true;
  for (const needle of committed) {
    if (equalsAsciiIgnoreCase(lineTag, needle)) return true;
  }
  if (draft && startsWithAsciiIgnoreCase(lineTag, draft)) {
    return true;
  }
  return false;
}

export function containsAsciiIgnoreCase(haystack: string, needle: string): boolean {
  return indexOfAsciiIgnoreCase(haystack, needle) >= 0;
}

export function levelAllowed(lineLevel: string, selected: readonly string[]): boolean {
  if (selected.length === 0) return true;
  const letter = parseLevelLetter(lineLevel);
  if (!letter) return false;
  for (const item of selected) {
    if (parseLevelLetter(item) === letter) return true;
  }
  return false;
}
function scopeMatches(line: LogLine, scope: LogScope): boolean {
  switch (scope.kind) {
    case "all":
      return true;
    case "pid":
      return line.pid === scope.pid;
    case "package":
      return scope.pids.includes(line.pid);
  }
}

/** 与 yohu-domain::log_filter_matches 同一语义。 */
export function logFilterMatches(filter: LogFilter, line: LogLine): boolean {
  if (!levelAllowed(line.level, filter.levels ?? [])) return false;
  if (filter.tag_contains !== undefined && !tagAllowed(line.tag, filter.tag_contains)) return false;
  if (filter.message_contains && !containsAsciiIgnoreCase(line.msg, filter.message_contains)) {
    return false;
  }
  return scopeMatches(line, filter.scope);
}

export function matchesWireFilter(line: LogLine, filter: LogFilter): boolean {
  return logFilterMatches(filter, line);
}
