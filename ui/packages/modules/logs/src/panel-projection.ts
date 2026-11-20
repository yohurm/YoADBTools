/**
 * 窗口文档投影：把 `log/hits` 尾部追加与 `log.window.bind` 页装进可见面板。
 * 只消费 `panel.ts` 纯函数，不持有全文、不碰 IPC。
 * 换过滤走 patchFilter：收窄已画行 + 重绑 PID + 向环要 replace 页。
 *
 * 写单源：
 * - `signalCount` 唯一由 `writePanel` 维护（增量累加，语义恒等于 `signalCountOf(visible)`），
 *   整文档替换（`replacePanel`）全量算一次；不接受服务端计数。
 * - `pendingCount` 增量唯一写在 `writePanel`；归零只在 `clearPanel` 与 follow `markFollowing`。
 * - `docShift`：追加裁头累加，整文档替换（`applyPage`）归零。
 * - `fromSeq` 不在本文件写：清设备后的游标转移交 `follow-state`。
 */

import type { SetStoreFunction } from "solid-js/store";
import { matchesWireFilter, normalizeLevels, type LogLine, type LogPage } from "@yohu/api";

import { rebindIfPackage } from "./device-projection";
import { sessionWire, toSessionFilter } from "./filter";
import type { LogUiState, SessionFilterPatch } from "./log-model";
import {
  applyAppend,
  EMPTY_VIEW_ROWS,
  keepMatching,
  panelFollows,
  panelFromLines,
  SESSION_NEVER_STARTED,
  signalCountOf,
  trimRows,
} from "./panel";
import { sessionCaptureIsLive } from "./session-chrome";
import { sessionAt, sessionIndex, sessionMissing, sessionOffSerial } from "./session-lifecycle";
import type { ViewRow } from "./stack";
import { findHeadOverlap } from "./stream/seq";

const DISPLAY_KEYS: readonly (keyof SessionFilterPatch)[] = ["levels", "tagContains", "keyword", "scope"];

export type PanelProjectionDeps = {
  viewCap: () => number;
  pageRequest: (id: number) => Promise<void>;
  markFollowing: (idx: number) => void;
  /** 清设备缓冲后的游标与跟滚转移（follow-state 单写：fromSeq / following / frozenThroughSeq）。 */
  resetFollowAfterDeviceClear: (idx: number) => void;
};

export type PanelProjectionApi = {
  clearPanel: (idx: number) => void;
  writePanel: (idx: number, rows: readonly ViewRow[], pendingCount: number) => void;
  appendToSession: (id: number, lines: readonly LogLine[]) => void;
  applyPage: (id: number, page: LogPage) => void;
  noteSeq: (idx: number, lines: readonly { seq: number }[]) => void;
  narrowDrawn: (id: number) => void;
  trimPanels: () => void;
  flushPanel: (id: number) => void;
  flushDevicePanels: (serial: string) => void;
  resetAfterDeviceClear: (serial: string) => void;
  catchUpSession: (id: number) => Promise<void>;
  patchFilter: (id: number, patch: SessionFilterPatch) => Promise<void>;
  setPaused: (id: number, paused: boolean) => Promise<void>;
};

/** 旧面板头被裁掉的行数：唯一 seq 对账原语见 `stream/seq`。 */
function headDropCount(previous: readonly ViewRow[], next: readonly ViewRow[]): number {
  return findHeadOverlap(previous, next, (row) => row.line.seq);
}

/** 指定区间 [from, to) 的信号行数；只扫被裁头 / 新增的小段，不碰整张 10 万行文档。 */
function signalCountRange(rows: readonly ViewRow[], from: number, to: number): number {
  let count = 0;
  for (let i = from; i < to; i += 1) {
    if (rows[i]!.signal) count += 1;
  }
  return count;
}

export function createPanelProjection(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  deps: PanelProjectionDeps,
): PanelProjectionApi {
  const viewCap = deps.viewCap;

  function clearPanel(idx: number): void {
    setState("sessions", idx, {
      visible: EMPTY_VIEW_ROWS,
      signalCount: 0,
      pendingCount: 0,
      docShift: 0,
    });
  }

  /** 整文档替换：`docShift` 归零（旧文档头已不存在，视口不必再按行数退回）。 */
  function replacePanel(idx: number, rows: readonly ViewRow[], pendingCount: number): void {
    const visible = trimRows(rows, viewCap());
    setState("sessions", idx, {
      visible,
      signalCount: signalCountOf(visible),
      pendingCount,
      docShift: 0,
    });
  }

  /**
   * 追加裁头：`pendingCount` 增量唯一写点；`docShift` 累加被裁掉的头。
   * `signalCount` 增量维护（旧计数 − 被裁头行信号 + 新增行信号），语义恒等于
   * `signalCountOf(visible)`；只有非后缀追加才退回全量。`docShift` 的头指针用 seq 单调二分，
   * 不再对整张文档 `reduce`/`findIndex`。
   */
  function writePanel(idx: number, rows: readonly ViewRow[], pendingCount: number): void {
    const session = state.sessions[idx];
    const visible = trimRows(rows, viewCap());
    let signalCount: number;
    let docShift: number;
    if (!session) {
      signalCount = signalCountOf(visible);
      docShift = 0;
    } else {
      const prev = session.visible;
      const drop = headDropCount(prev, visible);
      const overlap = drop >= 0 ? prev.length - drop : -1;
      const added = overlap >= 0 ? visible.length - overlap : -1;
      if (drop >= 0 && added >= 0) {
        signalCount =
          session.signalCount -
          signalCountRange(prev, 0, drop) +
          signalCountRange(visible, overlap, visible.length);
        docShift = session.docShift + drop;
      } else {
        // 非后缀追加（整段换过 / 全裁光）：退回全量一次，保证与 signalCountOf(visible) 一致。
        signalCount = signalCountOf(visible);
        docShift = session.docShift;
      }
    }
    if (
      session &&
      session.visible === visible &&
      session.signalCount === signalCount &&
      session.pendingCount === pendingCount &&
      session.docShift === docShift
    ) {
      return;
    }
    setState("sessions", idx, {
      visible,
      signalCount,
      pendingCount,
      docShift,
    });
  }

  function noteSeq(idx: number, lines: readonly { seq: number }[]): void {
    const last = lines.at(-1)?.seq;
    if (last === undefined) return;
    const seen = state.sessions[idx]?.lastSeenSeq ?? SESSION_NEVER_STARTED;
    if (last > seen) setState("sessions", idx, { lastSeenSeq: last });
  }

  function appendToSession(id: number, lines: readonly LogLine[]): void {
    const idx = sessionIndex(state, id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(state, idx);
    const following = panelFollows(session.following, session.visible);
    if (following && !session.following) {
      deps.markFollowing(idx);
    }
    const filter = toSessionFilter(session);
    // 仅全量过滤时命中 seq 连续，seq 跳跃才代表丢批；有过滤时命中 seq 天然离散。
    const expectContiguous =
      filter.levels.length === 0 && !filter.tagContains && !filter.keyword && filter.scope.kind === "all";
    const applied = applyAppend({
      visible: session.visible,
      lines,
      fromSeq: session.fromSeq,
      following,
      frozenThroughSeq: session.frozenThroughSeq,
      paused: session.paused,
      filter,
      expectContiguous,
      cap: viewCap(),
      pendingCount: following && !session.following ? 0 : session.pendingCount,
    });
    if (!applied) return;
    writePanel(idx, applied.visible, applied.pendingCount);
    noteSeq(idx, lines);
    // 连续游标空洞：本批命中前缺少 seq（丢批/掉线重连）。由 reducer 判定，装配层触发一次
    // 环对账补齐；`applyPage` 按 seq 对账，不会重复也不会覆盖已画新行。
    if (applied.gap) void deps.pageRequest(id);
  }

  function catchUpSession(id: number): Promise<void> {
    const idx = sessionIndex(state, id);
    if (sessionMissing(idx)) return Promise.resolve();
    if (!sessionCaptureIsLive(sessionAt(state, idx))) return Promise.resolve();
    return deps.pageRequest(id);
  }

  function narrowDrawn(id: number): void {
    const idx = sessionIndex(state, id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(state, idx);
    const kept = keepMatching(session.visible, toSessionFilter(session));
    replacePanel(idx, panelFromLines(kept, viewCap()), session.pendingCount);
  }

  /**
   * 整页装入 = 「页快照为真前缀 + 快照之后已经画出的新行必须保留」的按 seq 对账。
   *
   * `log.window.bind` 的页在**绑定时刻**取 `through = ring.next_seq()`，只覆盖 `seq <= through-1`；
   * 绑定之后经 `log/hits` 追加、且 `seq >= through` 的行不在页里。命中事件与 invoke 响应在 IPC
   * 上无序，若盲替换会把这些行冲掉（且不会再发）。因此用页末 seq 作水位：保留已画文档中
   * `seq > 页末 seq` 且仍满足**当前过滤**的行。换过滤时旧过滤里超出页末的多余行会被过滤掉，
   * 溢出回补时环里被漏掉的中间行由页补齐——两者都不丢、不重。
   */
  function applyPage(id: number, page: LogPage): void {
    const idx = sessionIndex(state, id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(state, idx);
    if (page.lines.length === 0 && page.total === 0 && session.visible.length > 0) {
      // 环里没有该窗口的命中（镜像被清 / 刚换过滤）：把新过滤应用到已画文档，
      // 而不是让旧过滤的行留在面板上。仍然是一次整文档替换。
      narrowDrawn(id);
      return;
    }
    const cap = viewCap();
    const pageRows = panelFromLines(page.lines, cap);
    const pageLast = pageRows.at(-1)?.line.seq;
    let rows: readonly ViewRow[] = pageRows;
    if (pageLast !== undefined) {
      const wire = sessionWire(toSessionFilter(session));
      const kept = session.visible.filter(
        (row) => row.line.seq > pageLast && matchesWireFilter(row.line, wire),
      );
      if (kept.length > 0) rows = trimRows([...pageRows, ...kept], cap);
    }
    replacePanel(idx, rows, session.pendingCount);
    noteSeq(idx, page.lines);
  }

  function flushPanel(id: number): void {
    const idx = sessionIndex(state, id);
    if (sessionMissing(idx)) return;
    clearPanel(idx);
  }

  function flushDevicePanels(serial: string): void {
    state.sessions.forEach((session) => {
      if (sessionOffSerial(session, serial)) return;
      flushPanel(session.id);
    });
  }

  /**
   * 清设备缓冲后重置该 serial 在采窗口：文档与计数归零（同 clearPanel），
   * 游标 `fromSeq=0` 与跟滚抬起交 `follow-state` 单写。
   */
  function resetAfterDeviceClear(serial: string): void {
    state.sessions.forEach((session, idx) => {
      if (session.serial !== serial) return;
      if (!sessionCaptureIsLive(session)) return;
      clearPanel(idx);
      setState("sessions", idx, { lastSeenSeq: SESSION_NEVER_STARTED });
      deps.resetFollowAfterDeviceClear(idx);
    });
  }

  function trimPanels(): void {
    state.sessions.forEach((session, idx) => {
      const trimmed = trimRows(session.visible, viewCap());
      if (trimmed.length === session.visible.length) return;
      writePanel(idx, trimmed, session.pendingCount);
    });
  }

  async function patchFilter(id: number, patch: SessionFilterPatch): Promise<void> {
    const idx = sessionIndex(state, id);
    if (sessionMissing(idx)) return;
    if (Object.keys(patch).length === 0) return;
    const next =
      patch.levels !== undefined ? { ...patch, levels: normalizeLevels(patch.levels) } : patch;
    setState("sessions", idx, next);
    rebindIfPackage(state, setState, idx);
    if (!DISPLAY_KEYS.some((key) => key in patch)) return;
    if (sessionCaptureIsLive(sessionAt(state, sessionIndex(state, id)))) {
      await deps.pageRequest(id);
      return;
    }
    narrowDrawn(id);
  }

  async function setPaused(id: number, paused: boolean): Promise<void> {
    const idx = sessionIndex(state, id);
    if (sessionMissing(idx)) return;
    if (sessionAt(state, idx).paused === paused) return;
    setState("sessions", idx, { paused });
    if (!paused) await deps.pageRequest(id);
  }

  return {
    clearPanel,
    writePanel,
    appendToSession,
    applyPage,
    noteSeq,
    narrowDrawn,
    trimPanels,
    flushPanel,
    flushDevicePanels,
    resetAfterDeviceClear,
    catchUpSession,
    patchFilter,
    setPaused,
  };
}
