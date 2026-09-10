/**
 * 日志过滤（纯函数，ADR-v6-006 消费端）：级别精确集合 / Tag·关键字包含 / Scope。
 * 与 yohu-domain::log_filter_matches 同一套 testdata/log_filter.json。
 * 级别字母单源：testdata/log_levels.json ↔ LEVELS；着色键仍走同一张表。
 */

import type { LogFilter, LogLine } from "@yohu/api";

import { pidSetOf, type PidBinding } from "./binding";

export const LEVELS = ["V", "D", "I", "W", "E", "F"] as const;
export type LevelLetter = (typeof LEVELS)[number];
/** 与 `--yohu-level-*` / 行 `data-level` 对齐的小写键。 */
export type LevelKey = "v" | "d" | "i" | "w" | "e" | "f";

function levelIndex(level: string): number {
  return (LEVELS as readonly string[]).indexOf(level.toUpperCase());
}

export function parseLevelLetter(level: string): LevelLetter | null {
  const idx = levelIndex(level);
  return idx < 0 ? null : LEVELS[idx]!;
}

const LEVEL_CAPTION: Record<LevelLetter, string> = {
  V: "Verbose",
  D: "Debug",
  I: "Info",
  W: "Warn",
  E: "Error",
  F: "Fatal",
};

export function levelLabel(letter: LevelLetter): string {
  return LEVEL_CAPTION[letter];
}

export function levelKey(level: string): LevelKey | null {
  const letter = parseLevelLetter(level);
  return letter ? (letter.toLowerCase() as LevelKey) : null;
}

/** 级别序：未知=0，V=1 … F=6（与 yohu-domain::level_rank 对齐；只给着色/契约，不参与筛选）。 */
export function levelRank(level: string): number {
  const idx = levelIndex(level);
  return idx < 0 ? 0 : idx + 1;
}

/** 只保留 LEVELS 中的字母，去重并按 V→F 排序。空 = 不限级别。 */
export function normalizeLevels(input: readonly string[]): LevelLetter[] {
  const seen = new Set<LevelLetter>();
  for (const raw of input) {
    const letter = parseLevelLetter(raw);
    if (letter) seen.add(letter);
  }
  return LEVELS.filter((letter) => seen.has(letter));
}

export function toggleLevel(selected: readonly string[], letter: LevelLetter): LevelLetter[] {
  const current = normalizeLevels(selected);
  return normalizeLevels(current.includes(letter) ? current.filter((item) => item !== letter) : [...current, letter]);
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

export type SessionScope =
  | { kind: "all" }
  | { kind: "package"; pkg: string; includeChild: boolean }
  | { kind: "pid"; pid: number };

export interface SessionFilter {
  levels: LevelLetter[];
  tagContains: string;
  keyword: string;
  scope: SessionScope;
  pidSet: number[];
}

/** ASCII 忽略大小写子串（与 domain `contains_ascii_ignore_case` 对齐）。 */
export function containsAsciiIgnoreCase(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true;
  if (needle.length > haystack.length) return false;
  const n = needle.length;
  outer: for (let i = 0; i <= haystack.length - n; i++) {
    for (let j = 0; j < n; j++) {
      const a = haystack.charCodeAt(i + j);
      const b = needle.charCodeAt(j);
      if (a === b) continue;
      const al = a >= 65 && a <= 90 ? a + 32 : a;
      const bl = b >= 65 && b <= 90 ? b + 32 : b;
      if (al !== bl) continue outer;
    }
    return true;
  }
  return false;
}

const SCOPE_ALL: LogFilter["scope"] = { kind: "all" };

export function matchesWireFilter(line: LogLine, f: LogFilter): boolean {
  return matchCore(line, f.levels ?? [], f.tag_contains ?? "", f.message_contains ?? "", f.scope);
}

export function matchesLine(line: LogLine, f: SessionFilter): boolean {
  switch (f.scope.kind) {
    case "all":
      return matchCore(line, f.levels, f.tagContains, f.keyword, SCOPE_ALL);
    case "pid":
      return matchCore(line, f.levels, f.tagContains, f.keyword, { kind: "pid", pid: f.scope.pid });
    case "package":
      return matchCore(line, f.levels, f.tagContains, f.keyword, { kind: "package", pids: f.pidSet });
  }
}

function matchCore(
  line: LogLine,
  levels: readonly string[],
  tag: string,
  message: string,
  scope: LogFilter["scope"],
): boolean {
  if (!levelAllowed(line.level, levels)) return false;
  if (tag && !containsAsciiIgnoreCase(line.tag, tag)) return false;
  if (message && !containsAsciiIgnoreCase(line.msg, message)) return false;
  switch (scope.kind) {
    case "all":
      return true;
    case "pid":
      return line.pid === scope.pid;
    case "package":
      return scope.pids.includes(line.pid);
  }
}

function sessionFilterToWire(f: SessionFilter): LogFilter {
  const levels = normalizeLevels(f.levels);
  const tag_contains = f.tagContains || undefined;
  const message_contains = f.keyword || undefined;
  const base = {
    ...(levels.length > 0 ? { levels } : {}),
    tag_contains,
    message_contains,
  };
  switch (f.scope.kind) {
    case "all":
      return { ...base, scope: { kind: "all" } };
    case "pid":
      return { ...base, scope: { kind: "pid", pid: f.scope.pid } };
    case "package":
      return { ...base, scope: { kind: "package", pids: f.pidSet } };
  }
}

export function toSessionFilter(input: {
  levels: readonly string[];
  tagContains: string;
  keyword: string;
  scope: SessionScope;
  binding: PidBinding;
}): SessionFilter {
  return {
    levels: normalizeLevels(input.levels),
    tagContains: input.tagContains,
    keyword: input.keyword,
    scope: input.scope,
    pidSet: pidSetOf(input.binding),
  };
}

export function toWireFilter(input: {
  levels: readonly string[];
  tagContains: string;
  keyword: string;
  scope: SessionScope;
  binding: PidBinding;
}): LogFilter {
  return sessionFilterToWire(toSessionFilter(input));
}
