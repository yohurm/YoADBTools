/**
 * 窗口可见区代数。环 / 镜像 / 面板共用同一套游标，禁止第二套「保护旧行」策略。
 *
 * 一行能进面板 ⟺ 已订阅 && seq >= fromSeq && (跟滚 || seq <= frozenThroughSeq) && 过滤命中。
 * 入镜、过滤、PID 重绑、跟滚、清空只通过本文件选择行。
 * 清空把 fromSeq 推过已见与镜像末 seq，旧行不能再投影回来。
 */

import { matchesWireFilter, type LogLine } from "@yohu/api";

import { sessionWire, type SessionFilter } from "./filter";
import { collapseStack, type ViewRow } from "./stack";

export const EMPTY_VIEW_ROWS: ViewRow[] = [];

/** 从未开始采集。会话写入这个游标；面板用 `captureStarted` 识别它。 */
export const SESSION_NEVER_STARTED = -1;

/** 游标已经离开「从未开始」。导出、续采、入镜共用。 */
export function captureStarted(fromSeq: number): boolean {
  return fromSeq > SESSION_NEVER_STARTED;
}

/** 订阅起点之前的游标。从未开始时停在哨兵上。 */
export function seqBefore(fromSeq: number): number {
  return captureStarted(fromSeq) ? fromSeq - 1 : SESSION_NEVER_STARTED;
}

export function lastSeqOf(rows: readonly ViewRow[], fromSeq: number): number {
  const last = rows.at(-1);
  if (last) return last.line.seq;
  return seqBefore(fromSeq);
}

/**
 * 没有已画行就没有「底部」。空面板冻结会把 ceiling 落到 fromSeq 之前，
 * 后续行全进 pending，空态却仍显示「等待设备输出」。
 */
export function canFreezeFollow(visible: readonly ViewRow[]): boolean {
  return visible.length > 0;
}

/** 空面板没有已画行，跟滚必须抬起。入镜和会话标志都认这一把。 */
export function panelFollows(following: boolean, visible: readonly ViewRow[]): boolean {
  return following || !canFreezeFollow(visible);
}

/** 入镜 / 回放共用：seq 在窗口起点之后、且晚于已画末行。 */
export function isFreshLine(seq: number, after: number, fromSeq: number): boolean {
  return seq > after && seq >= fromSeq;
}

export function viewCeiling(following: boolean, frozenThroughSeq: number | null): number | null {
  return following ? null : frozenThroughSeq;
}

/** 镜像里是否还有本窗口游标范围内的行。空镜像不得当权威源去冲面板。 */
export function mirrorCoversRange(size: number, lastSeq: number, fromSeq: number): boolean {
  return captureStarted(fromSeq) && size > 0 && lastSeq >= fromSeq;
}

/** 清空可见区：游标推到已见与镜像之后，旧 seq 全部失效。 */
export function nextDiscardFromSeq(
  fromSeq: number,
  lastVisibleSeq: number | undefined,
  mirrorLast: number,
): number {
  if (!captureStarted(fromSeq)) return fromSeq;
  const visible = lastVisibleSeq ?? seqBefore(fromSeq);
  return Math.max(fromSeq, visible + 1, mirrorLast + 1);
}

export function trimRows(rows: readonly ViewRow[], cap: number): ViewRow[] {
  const n = Math.max(1, cap);
  return rows.length > n ? rows.slice(rows.length - n) : (rows as ViewRow[]);
}

/** 当前可见面板上的信号行；裁剪后必须重算，禁止累计已滚出的行。 */
export function signalCountOf(rows: readonly ViewRow[]): number {
  return rows.reduce((acc, row) => acc + (row.signal ? 1 : 0), 0);
}

export function keepMatching(rows: readonly ViewRow[], filter: SessionFilter): LogLine[] {
  const wire = sessionWire(filter);
  return rows.filter((row) => matchesWireFilter(row.line, wire)).map((row) => row.line);
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

const EMPTY_FOR_PANEL: LogLine[] = [];

function noLines(lines: readonly LogLine[]): boolean {
  return lines.length === 0;
}

export function selectHits(
  lines: readonly LogLine[],
  fromSeq: number,
  ceiling: number | null,
  filter: SessionFilter,
): { forPanel: LogLine[]; pending: number } {
  if (!captureStarted(fromSeq)) return { forPanel: EMPTY_FOR_PANEL, pending: 0 };
  const wire = sessionWire(filter);
  const hits = lines.filter((line) => line.seq >= fromSeq && matchesWireFilter(line, wire));
  return splitHitsForFreeze(hits, ceiling);
}

export function appendLines(
  current: readonly ViewRow[],
  lines: readonly LogLine[],
  cap: number,
): ViewRow[] {
  if (noLines(lines)) return trimRows(current, cap);
  return trimRows([...current, ...collapseStack(lines)], cap);
}

export function panelFromLines(
  lines: readonly LogLine[],
  cap: number,
): { visible: ViewRow[]; signalCount: number } {
  if (noLines(lines)) return { visible: EMPTY_VIEW_ROWS, signalCount: 0 };
  const visible = trimRows(collapseStack(lines), cap);
  return { visible, signalCount: signalCountOf(visible) };
}

export interface ViewApply {
  visible: ViewRow[];
  signalCount: number;
  pendingCount: number;
}

/**
 * 过滤投影。镜像覆盖游标范围时镜像是唯一权威；否则只收窄已画行，不冲成空、不把旧行补回来。
 */
export function projectWindow(opts: {
  drawn: readonly ViewRow[];
  source: readonly LogLine[];
  sourceCoversRange: boolean;
  fromSeq: number;
  following: boolean;
  frozenThroughSeq: number | null;
  filter: SessionFilter;
  cap: number;
  pendingCount: number;
}): ViewApply {
  const ceiling = viewCeiling(opts.following, opts.frozenThroughSeq);
  if (!opts.sourceCoversRange) {
    const kept = keepMatching(opts.drawn, opts.filter);
    const { forPanel } = splitHitsForFreeze(kept, ceiling);
    const next = panelFromLines(forPanel, opts.cap);
    return { ...next, pendingCount: opts.pendingCount };
  }
  const { forPanel, pending } = selectHits(opts.source, opts.fromSeq, ceiling, opts.filter);
  return { ...panelFromLines(forPanel, opts.cap), pendingCount: pending };
}

/**
 * 入镜 / 补洞。暂停丢弃。未跟滚仍把正文写入文档并累计 pending，视口不跟。
 * 无新行且跟滚中：把 pending 清零（尾部已对齐）。
 */
export function applyAppend(opts: {
  visible: readonly ViewRow[];
  lines: readonly LogLine[];
  fromSeq: number;
  following: boolean;
  paused: boolean;
  filter: SessionFilter;
  cap: number;
  pendingCount: number;
}): ViewApply | null {
  if (opts.paused || !captureStarted(opts.fromSeq)) return null;
  const following = panelFollows(opts.following, opts.visible);
  const after = lastSeqOf(opts.visible, opts.fromSeq);
  const wire = sessionWire(opts.filter);
  const fresh = opts.lines.filter(
    (line) => isFreshLine(line.seq, after, opts.fromSeq) && matchesWireFilter(line, wire),
  );
  if (fresh.length === 0) {
    if (!following) return null;
    const visible = trimRows(opts.visible, opts.cap);
    if (visible === opts.visible && opts.pendingCount === 0) return null;
    return {
      visible,
      signalCount: signalCountOf(visible),
      pendingCount: 0,
    };
  }
  if (!following) {
    const visible = appendLines(opts.visible, fresh, opts.cap);
    return {
      visible,
      signalCount: signalCountOf(visible),
      pendingCount: opts.pendingCount + fresh.length,
    };
  }
  const visible = appendLines(opts.visible, fresh, opts.cap);
  return { visible, signalCount: signalCountOf(visible), pendingCount: 0 };
}
