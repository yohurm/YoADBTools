/**
 * 日志窗口文档的唯一状态机（L2 纯函数，无 store / DOM / IPC 依赖）。
 *
 * 环 / 文档 / 面板共用同一套游标，禁止第二套「保护旧行」策略：
 * 一行能进面板 ⟺ 已订阅 && seq >= fromSeq && seq > 已画末行 && 过滤命中。
 * 连续 seq 判定（空洞）也在此：`applyAppend` 用命中首 seq 对照已画末行，
 * 越过即返回 `gap`，由装配层触发一次环对账（`log.window.bind`）。
 * 未跟滚时 `pendingCount` 只数冻结点之后新到的行；冻结点之前补进来的属回补。
 * 清空把 fromSeq 推过已见与已见末 seq，旧行不能再投影回来。
 * 滚动比例唯一来源是文档行数（`visible.length`），不再有第二份命中总数。
 */

import { matchesWireFilter, type LogLine } from "@yohu/api";

import { sessionWire, type SessionFilter } from "../filter";
import { collapseStack, type ViewRow } from "../stack";

export const EMPTY_VIEW_ROWS: readonly ViewRow[] = [];

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

/**
 * 「有效跟滚」单源：`follow-state` 的 `following` 加暂停维度。
 * View 只读这一个值当 `autoScroll`，不再自己组合 `following && !paused`。
 */
export function effectiveFollowing(following: boolean, paused: boolean): boolean {
  return following && !paused;
}

/** 入镜 / 回放共用：seq 在窗口起点之后、且晚于已画末行。 */
export function isFreshLine(seq: number, after: number, fromSeq: number): boolean {
  return seq > after && seq >= fromSeq;
}

/**
 * 冻结点：未跟滚时「离开底部那一刻的末 seq」，跟滚中为 null。
 * 它只决定「哪些行算新到的」，不挡入文档（离开底部仍写文档，视口不动）。
 * 冻结点缺失时退到已画末行，保证不退化成第二种「保护旧行」策略。
 */
export function freezePoint(frozenThroughSeq: number | null, after: number): number {
  return frozenThroughSeq === null ? after : Math.max(after, frozenThroughSeq);
}

/** 清空可见区：游标推到已见末 seq 之后，旧 seq 全部失效。 */
export function nextDiscardFromSeq(
  fromSeq: number,
  lastVisibleSeq: number | undefined,
  lastSeenSeq: number,
): number {
  if (!captureStarted(fromSeq)) return fromSeq;
  const visible = lastVisibleSeq ?? seqBefore(fromSeq);
  return Math.max(fromSeq, visible + 1, lastSeenSeq + 1);
}

/** 裁剪到容量上限；未超限时原样返回同一引用，超限时返回只读切片（不复用可变单例）。 */
export function trimRows(rows: readonly ViewRow[], cap: number): readonly ViewRow[] {
  const n = Math.max(1, cap);
  return rows.length > n ? rows.slice(rows.length - n) : rows;
}

/** 当前可见面板上的信号行；裁剪后必须重算，禁止累计已滚出的行。信号计数唯一派生。 */
export function signalCountOf(rows: readonly ViewRow[]): number {
  return rows.reduce((acc, row) => acc + (row.signal ? 1 : 0), 0);
}

export function keepMatching(rows: readonly ViewRow[], filter: SessionFilter): LogLine[] {
  const wire = sessionWire(filter);
  return rows.filter((row) => matchesWireFilter(row.line, wire)).map((row) => row.line);
}

function noLines(lines: readonly LogLine[]): boolean {
  return lines.length === 0;
}

export function appendLines(
  current: readonly ViewRow[],
  lines: readonly LogLine[],
  cap: number,
): readonly ViewRow[] {
  if (noLines(lines)) return trimRows(current, cap);
  return trimRows([...current, ...collapseStack(lines)], cap);
}

/** 整文档替换（页装入 / 收窄）。返回裁剪后的行；信号计数由 `signalCountOf` 单点派生。 */
export function panelFromLines(lines: readonly LogLine[], cap: number): readonly ViewRow[] {
  if (noLines(lines)) return EMPTY_VIEW_ROWS;
  return trimRows(collapseStack(lines), cap);
}

/** 连续游标空洞：命中的首 seq 越过「已画末 seq + 1」时，缺失的 seq 区间。 */
export interface SeqGap {
  fromSeq: number;
  toSeq: number;
}

export interface ViewApply {
  visible: readonly ViewRow[];
  pendingCount: number;
  /** 非空表示这批命中前有 seq 空洞，装配层应触发一次环对账补齐。 */
  gap?: SeqGap;
}

/**
 * 入镜 / 补洞。暂停丢弃。未跟滚仍把正文写入文档并累计 pending，视口不跟。
 * `pendingCount` 只数冻结点之后新到的行（`freezePoint`），冻结点之前补进来的回补不计。
 * 无新行且跟滚中：把 pending 清零（尾部已对齐）。
 * 信号计数不在此派生（每批 O(n) 会拖慢大文档）：由 `writePanel` 增量维护。
 */
export function applyAppend(opts: {
  visible: readonly ViewRow[];
  lines: readonly LogLine[];
  fromSeq: number;
  following: boolean;
  frozenThroughSeq: number | null;
  paused: boolean;
  filter: SessionFilter;
  cap: number;
  pendingCount: number;
  /**
   * 只有「全量过滤」（不限级别/Tag/关键字/范围）时命中 seq 才连续，seq 跳跃才等于丢批。
   * 有过滤时命中 seq 天然离散（中间非命中行的 seq 不出现），不能用 seq 判空洞，
   * 否则每批都会误报空洞、反复整页回补。默认 true（无过滤判定）。
   */
  expectContiguous?: boolean;
  /** 重建（换过滤）时可越过暂停把环里已有行装回文档。 */
  allowPaused?: boolean;
}): ViewApply | null {
  if ((opts.paused && !opts.allowPaused) || !captureStarted(opts.fromSeq)) return null;
  const following = panelFollows(opts.following, opts.visible);
  const after = lastSeqOf(opts.visible, opts.fromSeq);
  const firstSeq = opts.lines.length > 0 ? opts.lines[0]!.seq : undefined;
  const contiguous = opts.expectContiguous !== false;
  const gap: SeqGap | undefined =
    contiguous && firstSeq !== undefined && firstSeq > after + 1 && firstSeq >= opts.fromSeq
      ? { fromSeq: after + 1, toSeq: firstSeq - 1 }
      : undefined;
  const frozen = freezePoint(opts.frozenThroughSeq, after);
  const wire = sessionWire(opts.filter);
  const fresh = opts.lines.filter(
    (line) => isFreshLine(line.seq, after, opts.fromSeq) && matchesWireFilter(line, wire),
  );
  if (fresh.length === 0) {
    if (!following) return gap ? { visible: opts.visible, pendingCount: opts.pendingCount, gap } : null;
    const visible = trimRows(opts.visible, opts.cap);
    if (visible === opts.visible && opts.pendingCount === 0 && !gap) return null;
    return {
      visible,
      pendingCount: 0,
      ...(gap ? { gap } : {}),
    };
  }
  const visible = appendLines(opts.visible, fresh, opts.cap);
  if (opts.allowPaused) return { visible, pendingCount: opts.pendingCount };
  if (!following) {
    const arrived = fresh.reduce((acc, line) => acc + (line.seq > frozen ? 1 : 0), 0);
    return {
      visible,
      pendingCount: opts.pendingCount + arrived,
      ...(gap ? { gap } : {}),
    };
  }
  return { visible, pendingCount: 0, ...(gap ? { gap } : {}) };
}
