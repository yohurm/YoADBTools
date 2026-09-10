/**
 * 窗口显示面板（纯函数）。
 *
 * 入镜路径 append-only：只允许调用方显式 flush（重新开始采集、清空、清设备缓冲）。
 * 过滤路径走 rebuildFiltered：已画出仍匹配 ∪ 镜像命中按 seq 合并；镜像为空时只可能变少。
 * 未跟滚时由调用方把镜像命中裁到冻结末 seq，尾部计 pending；不得把过滤重建当成 resumeFollow。
 */

import type { LogLine } from "@yohu/api";

import {
  collapseStack,
  matchesLine,
  type SessionFilter,
  type ViewRow,
} from "./pipeline";

/** 订阅起点之前的游标；fromSeq 为负表示从未开始。 */
export function seqBefore(fromSeq: number): number {
  return fromSeq < 0 ? -1 : fromSeq - 1;
}

export function lastSeqOf(rows: readonly ViewRow[], fromSeq: number): number {
  const last = rows.at(-1);
  if (last) return last.line.seq;
  return seqBefore(fromSeq);
}

/** 入镜 / 回放共用：seq 在窗口起点之后、且晚于已画末行。 */
export function isFreshLine(seq: number, after: number, fromSeq: number): boolean {
  return seq > after && seq >= fromSeq;
}

export function trimRows(rows: readonly ViewRow[], cap: number): ViewRow[] {
  const n = Math.max(1, cap);
  return rows.length > n ? rows.slice(rows.length - n) : [...rows];
}

/** 当前可见面板上的信号行；裁剪后必须重算，禁止累计已滚出的行。 */
export function signalCountOf(rows: readonly ViewRow[]): number {
  return rows.reduce((acc, row) => acc + (row.signal ? 1 : 0), 0);
}

export function keepMatching(rows: readonly ViewRow[], filter: SessionFilter): LogLine[] {
  return rows.filter((row) => matchesLine(row.line, filter)).map((row) => row.line);
}

/** 两条已按 seq 升序的行集合按 seq 合并去重；同 seq 取右侧（镜像）。 */
export function mergeLinesBySeq(left: readonly LogLine[], right: readonly LogLine[]): LogLine[] {
  if (right.length === 0) return [...left];
  if (left.length === 0) return [...right];
  const out: LogLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const a = left[i]!.seq;
    const b = right[j]!.seq;
    if (a < b) {
      out.push(left[i]!);
      i++;
    } else if (b < a) {
      out.push(right[j]!);
      j++;
    } else {
      out.push(right[j]!);
      i++;
      j++;
    }
  }
  while (i < left.length) {
    out.push(left[i]!);
    i++;
  }
  while (j < right.length) {
    out.push(right[j]!);
    j++;
  }
  return out;
}

/**
 * 未跟滚：ceiling 以内进面板，之外计 pending。
 * 跟滚：ceiling 为 null，命中全部进面板。
 */
export function splitHitsForFreeze(
  hits: readonly LogLine[],
  ceiling: number | null,
): { forPanel: LogLine[]; pending: number } {
  if (ceiling === null) return { forPanel: [...hits], pending: 0 };
  const forPanel: LogLine[] = [];
  let pending = 0;
  for (const line of hits) {
    if (line.seq <= ceiling) forPanel.push(line);
    else pending++;
  }
  return { forPanel, pending };
}

export function appendLines(
  current: readonly ViewRow[],
  lines: readonly LogLine[],
  cap: number,
): ViewRow[] {
  if (lines.length === 0) return trimRows(current, cap);
  return trimRows([...current, ...collapseStack(lines)], cap);
}

export function panelFromLines(
  lines: readonly LogLine[],
  cap: number,
): { visible: ViewRow[]; signalCount: number } {
  const visible = trimRows(collapseStack(lines), cap);
  return { visible, signalCount: signalCountOf(visible) };
}

/**
 * 显示过滤变更：已画出仍匹配的行 ∪ 镜像命中（调用方已按新过滤筛过），按 seq 合并重建。
 * 与入镜「只在末行之后追加」解耦；镜像为空时只可能变少，不会冲成空。
 */
export function rebuildFiltered(
  drawn: readonly ViewRow[],
  mirrorHits: readonly LogLine[],
  filter: SessionFilter,
  cap: number,
): { visible: ViewRow[]; signalCount: number } {
  return panelFromLines(mergeLinesBySeq(keepMatching(drawn, filter), mirrorHits), cap);
}
