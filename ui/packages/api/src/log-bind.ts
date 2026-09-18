/**
 * 包名会话 PID 重绑。与 yohu-domain::log_bind 同一套 testdata/log_bind.json。
 */

import { normalizeLevels, tagFilterActive } from "./log-filter";
import type { LogFilter, LogScope, ProcessEntry } from "./types";

export const HISTORY_PID_CAP = 8;

export interface PidBinding {
  current: number[];
  history: number[];
}

export function emptyBinding(): PidBinding {
  return { current: [], history: [] };
}

export function copyBinding(binding: PidBinding): PidBinding {
  return { current: [...binding.current], history: [...binding.history] };
}

export function rebindPids(
  prev: PidBinding,
  index: readonly ProcessEntry[],
  pkg: string,
  includeChild: boolean,
  historyCap: number = HISTORY_PID_CAP,
): PidBinding {
  const current = index
    .filter((entry) => (includeChild ? entry.name === pkg || entry.name.startsWith(`${pkg}:`) : entry.name === pkg))
    .map((entry) => entry.pid);
  let history = [...prev.history];
  for (const pid of current) {
    if (!history.includes(pid)) history.push(pid);
  }
  if (history.length > historyCap) {
    history = history.slice(history.length - historyCap);
  }
  return { current, history };
}

export function pidSetOf(binding: PidBinding): number[] {
  const out: number[] = [];
  for (const pid of [...binding.current, ...binding.history]) {
    if (!out.includes(pid)) out.push(pid);
  }
  return out;
}

export type WireFilterScope =
  | { kind: "all" }
  | { kind: "package" }
  | { kind: "pid"; pid: number };

export function toWireFilter(input: {
  levels: readonly string[];
  tagContains: string;
  keyword: string;
  scope: WireFilterScope | { kind: "package"; pkg?: string; includeChild?: boolean };
  pidSet?: number[];
  binding?: PidBinding;
}): LogFilter {
  const levels = normalizeLevels(input.levels);
  const tag_contains = tagFilterActive(input.tagContains) ? input.tagContains : undefined;
  const message_contains = input.keyword || undefined;
  const pidSet = input.pidSet ?? (input.binding ? pidSetOf(input.binding) : []);
  let scope: LogScope;
  switch (input.scope.kind) {
    case "pid":
      scope = { kind: "pid", pid: input.scope.pid };
      break;
    case "package":
      scope = { kind: "package", pids: pidSet };
      break;
    default:
      scope = { kind: "all" };
  }
  return {
    ...(levels.length > 0 ? { levels } : {}),
    tag_contains,
    message_contains,
    scope,
  };
}
