/**
 * 日志过滤栏铬：级别开关、Tag Chip、会话过滤形状。
 * 匹配内核在 @yohu/api（镜像 yohu-domain::log_filter）。
 */

import type { LogFilter, LogLine } from "@yohu/api";
import {
  LEVELS,
  containsAsciiIgnoreCase,
  equalsAsciiIgnoreCase,
  levelAllowed,
  matchesWireFilter,
  normalizeLevels,
  parseLevelLetter,
  parseTagNeedles,
  pidSetOf,
  tagAllowed,
  tagFilterActive,
  toWireFilter as sessionToWireFilter,
  type LevelLetter,
  type PidBinding,
} from "@yohu/api";

export {
  LEVELS,
  containsAsciiIgnoreCase,
  equalsAsciiIgnoreCase,
  matchesWireFilter,
  normalizeLevels,
  parseLevelLetter,
  parseTagNeedles,
  tagFilterActive,
};
export type { LevelLetter };

/** 筛选钮 / `--yohu-level-*` 键；由 LEVELS 派生。着色在 editor/format 引擎，筛选钮只认 LEVELS 派生键。 */
export type LevelKey = Lowercase<LevelLetter>;

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

export function toggleLevel(selected: readonly string[], letter: LevelLetter): LevelLetter[] {
  const current = normalizeLevels(selected);
  return normalizeLevels(current.includes(letter) ? current.filter((item) => item !== letter) : [...current, letter]);
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

/** 会话过滤热路径：走 api 原语，不按行 new `LogFilter`。 */
export function matchesLine(line: LogLine, f: SessionFilter): boolean {
  if (!levelAllowed(line.level, f.levels)) return false;
  if (!tagAllowed(line.tag, f.tagContains)) return false;
  if (f.keyword && !containsAsciiIgnoreCase(line.msg, f.keyword)) return false;
  switch (f.scope.kind) {
    case "all":
      return true;
    case "pid":
      return line.pid === f.scope.pid;
    case "package":
      return f.pidSet.includes(line.pid);
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
  binding?: PidBinding;
  pidSet?: number[];
}): LogFilter {
  return sessionToWireFilter({
    ...input,
    pidSet: input.pidSet ?? (input.binding ? pidSetOf(input.binding) : []),
  });
}
