/**
 * 日志过滤栏铬：级别开关、Tag Chip、会话过滤形状。
 * 匹配内核在 @yohu/api（镜像 yohu-domain::log_filter）。
 */

import type { LogFilter } from "@yohu/api";
import {
  equalsAsciiIgnoreCase,
  normalizeLevels,
  parseTagFilterNeedles,
  pidSetOf,
  toWireFilter,
  type LevelLetter,
  type PidBinding,
} from "@yohu/api";

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

export function toggleLevel(selected: readonly string[], letter: LevelLetter): LevelLetter[] {
  const current = normalizeLevels(selected);
  return normalizeLevels(current.includes(letter) ? current.filter((item) => item !== letter) : [...current, letter]);
}

export type SessionScope =
  | { kind: "all" }
  | { kind: "package"; pkg: string; includeChild: boolean }
  | { kind: "pid"; pid: number };

/** 包名窗口。进程重绑只认这一把。徽章表仍按范围分句。 */
export function scopeIsPackage(
  scope: SessionScope,
): scope is Extract<SessionScope, { kind: "package" }> {
  return scope.kind === "package";
}

/** 过滤条范围徽章。全范围这一句也是默认窗口标题。 */
export function scopeBadge(scope: SessionScope): string {
  switch (scope.kind) {
    case "package":
      return `包名: ${scope.pkg}`;
    case "pid":
      return `PID: ${scope.pid}`;
    case "all":
      return "System";
  }
}

export interface SessionFilter {
  levels: LevelLetter[];
  tagContains: string;
  keyword: string;
  scope: SessionScope;
  pidSet: number[];
}

function tagGap(): string {
  return ", ";
}

export function joinTagInput(committed: readonly string[], draft: string): string {
  const tags = uniqueTagNeedles(committed);
  if (tags.length === 0) return draft;
  const head = tags.join(tagGap());
  return draft ? `${head}${tagGap()}${draft}` : `${head}${tagGap()}`;
}

function sameTagNeedle(item: string, tag: string): boolean {
  return equalsAsciiIgnoreCase(item, tag);
}

export function uniqueTagNeedles(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    if (!tag) continue;
    if (out.some((item) => sameTagNeedle(item, tag))) continue;
    out.push(tag);
  }
  return out;
}

export function removeTagNeedle(raw: string, tag: string): string {
  const { committed, draft } = parseTagFilterNeedles(raw);
  return joinTagInput(
    committed.filter((item) => !sameTagNeedle(item, tag)),
    draft,
  );
}

/** 会话形状投影成 wire 过滤器。投影用 `@yohu/api` 的 `toWireFilter`，逐行只走 `matchesWireFilter`。 */
export function sessionWire(f: SessionFilter): LogFilter {
  return toWireFilter({
    levels: f.levels,
    tagContains: f.tagContains,
    keyword: f.keyword,
    scope: f.scope,
    pidSet: f.pidSet,
  });
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
