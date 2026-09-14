/**
 * 日志过滤（纯函数，ADR-v6-006 消费端）：级别精确集合 / Tag 多针 OR 精确命中·关键字包含 / Scope。
 * 与 yohu-domain::log_filter_matches 同一套 testdata/log_filter.json。
 * 级别字母单源：testdata/log_levels.json ↔ LEVELS；着色键 LevelKey = Lowercase<LevelLetter>。
 */

import type { LogFilter, LogLine } from "@yohu/api";

import { pidSetOf, type PidBinding } from "./binding";

export const LEVELS = ["V", "D", "I", "W", "E", "F"] as const;
export type LevelLetter = (typeof LEVELS)[number];
/** 与 `--yohu-level-*` / 行 `data-level` 对齐；由 LEVELS 派生，禁止再写一份小写表。 */
export type LevelKey = Lowercase<LevelLetter>;

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

/** Tag 针分隔：逗号 / 分号 / `|`。空白留在针内（内核 Tag 可含空格）。无正则。 */
const TAG_NEEDLE_SEP = /[,，、;；|]/;

/** 拆 `tagContains` 为多个针；空段丢掉。空结果 = 不限 Tag。 */
export function parseTagNeedles(raw: string): string[] {
  if (!raw) return [];
  const needles: string[] = [];
  for (const part of raw.split(TAG_NEEDLE_SEP)) {
    const needle = part.trim();
    if (needle) needles.push(needle);
  }
  return needles;
}

export function tagFilterActive(raw: string): boolean {
  return parseTagNeedles(raw).length > 0;
}

/** ASCII 忽略大小写精确等价（Tag 针，不是子串；避免 libc 命中 libcomposer_ext）。 */
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

const TAG_TRAILING_SEP = /[,，、;；|]\s*$/;

/** 已提交的针（气泡）与正在输入的草稿。尾部分隔符 = 全部已提交。 */
export function splitTagInput(raw: string): { committed: string[]; draft: string } {
  const needles = parseTagNeedles(raw);
  if (needles.length === 0) return { committed: [], draft: "" };
  if (TAG_TRAILING_SEP.test(raw)) return { committed: needles, draft: "" };
  return { committed: needles.slice(0, -1), draft: needles[needles.length - 1]! };
}

export function joinTagInput(committed: readonly string[], draft: string): string {
  const tags = uniqueTagNeedles(committed);
  if (tags.length === 0) return draft;
  const head = tags.join(", ");
  return draft ? `${head}, ${draft}` : `${head}, `;
}

export function uniqueTagNeedles(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    if (!tag) continue;
    if (out.some((item) => equalsAsciiIgnoreCase(item, tag))) continue;
    out.push(tag);
  }
  return out;
}

export function removeTagNeedle(raw: string, tag: string): string {
  const { committed, draft } = splitTagInput(raw);
  return joinTagInput(
    committed.filter((item) => !equalsAsciiIgnoreCase(item, tag)),
    draft,
  );
}

/** 空针不限；非空则任一针 ASCII 忽略大小写精确命中。 */
export function tagAllowed(lineTag: string, spec: string): boolean {
  const needles = parseTagNeedles(spec);
  if (needles.length === 0) return true;
  for (const needle of needles) {
    if (equalsAsciiIgnoreCase(lineTag, needle)) return true;
  }
  return false;
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
  if (!tagAllowed(line.tag, tag)) return false;
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
  const tag_contains = tagFilterActive(f.tagContains) ? f.tagContains : undefined;
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
