/**
 * 日志过滤（纯函数，ADR-v6-006 消费端）：级别含以上 / Tag·关键字包含 / Scope。
 * 与 yohu-domain::log_filter_matches 同一套 testdata/log_filter.json。
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

export function levelKey(level: string): LevelKey | null {
  const idx = levelIndex(level);
  return idx < 0 ? null : (LEVELS[idx]!.toLowerCase() as LevelKey);
}

/** 级别序：未知=0，V=1 … F=6（与 yohu-domain::level_rank 对齐）。 */
export function levelRank(level: string): number {
  const idx = levelIndex(level);
  return idx < 0 ? 0 : idx + 1;
}

export type SessionScope =
  | { kind: "all" }
  | { kind: "package"; pkg: string; includeChild: boolean }
  | { kind: "pid"; pid: number };

export interface SessionFilter {
  minLevel: string | null;
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

export function matchesWireFilter(line: LogLine, f: LogFilter): boolean {
  if (f.min_level) {
    const min = f.min_level[0];
    if (min && levelRank(line.level) < levelRank(min)) return false;
  }
  if (f.tag_contains && !containsAsciiIgnoreCase(line.tag, f.tag_contains)) return false;
  if (f.message_contains && !containsAsciiIgnoreCase(line.msg, f.message_contains)) return false;
  switch (f.scope.kind) {
    case "all":
      return true;
    case "pid":
      return line.pid === f.scope.pid;
    case "package":
      return f.scope.pids.includes(line.pid);
  }
}

export function matchesLine(line: LogLine, f: SessionFilter): boolean {
  return matchesWireFilter(line, sessionFilterToWire(f));
}

function sessionFilterToWire(f: SessionFilter): LogFilter {
  const min_level = f.minLevel ?? undefined;
  const tag_contains = f.tagContains || undefined;
  const message_contains = f.keyword || undefined;
  switch (f.scope.kind) {
    case "all":
      return { min_level, tag_contains, message_contains, scope: { kind: "all" } };
    case "pid":
      return { min_level, tag_contains, message_contains, scope: { kind: "pid", pid: f.scope.pid } };
    case "package":
      return { min_level, tag_contains, message_contains, scope: { kind: "package", pids: f.pidSet } };
  }
}

export function toSessionFilter(input: {
  minLevel: string | null;
  tagContains: string;
  keyword: string;
  scope: SessionScope;
  binding: PidBinding;
}): SessionFilter {
  return {
    minLevel: input.minLevel,
    tagContains: input.tagContains,
    keyword: input.keyword,
    scope: input.scope,
    pidSet: pidSetOf(input.binding),
  };
}

export function toWireFilter(input: {
  minLevel: string | null;
  tagContains: string;
  keyword: string;
  scope: SessionScope;
  binding: PidBinding;
}): LogFilter {
  return sessionFilterToWire(toSessionFilter(input));
}
