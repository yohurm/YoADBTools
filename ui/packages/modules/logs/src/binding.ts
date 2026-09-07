/**
 * 包名会话 PID 重绑（纯数据；历史集上限默认 8）。
 */

import type { ProcessEntry } from "@yohu/api";

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
    .filter((e) => (includeChild ? e.name === pkg || e.name.startsWith(`${pkg}:`) : e.name === pkg))
    .map((e) => e.pid);
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
  return [...new Set([...binding.current, ...binding.history])];
}
