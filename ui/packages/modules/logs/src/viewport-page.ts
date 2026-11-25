/**
 * 视口分页（ADR-v6-050）：UI 只持视口窗口，过滤与分页由 core `log.query` 执行。
 *
 * - `loadPage`：换过滤 / 首次开始 / 恢复 → 从环尾 `backward` 取一窗命中作为新窗口。
 * - `catchUp`：实时水位 → `forward` 取窗口游标之后的命中；积压超过一窗则回退为取环尾一窗。
 * - `loadOlder` / `loadNewer`：滚动分页（向前/向后）。
 */

import { logQuery, type LogFilter, type LogQueryPage, type LogQueryRequest } from "@yohu/api";

import { sessionWire, toSessionFilter } from "./filter";
import type { LogUiState } from "./log-model";
import { sessionCaptureIsLive } from "./session-chrome";
import { sessionById } from "./session-lifecycle";
import { docCap } from "./viewport";

const PAGE = 500;

export type ViewportPageApi = {
  loadPage: (id: number) => Promise<void>;
  catchUp: (id: number) => Promise<void>;
  loadOlder: (id: number) => Promise<void>;
  loadNewer: (id: number) => Promise<void>;
};

export type ViewportPageDeps = {
  resetRingCursor: (id: number) => void;
  setLastSeen: (id: number, seq: number) => void;
  appendRingLines: (id: number, lines: readonly import("@yohu/api").LogLine[], force?: boolean) => void;
  prependWindow: (id: number, lines: readonly import("@yohu/api").LogLine[]) => void;
  firstSeqOf: (id: number) => number | null;
  lastSeqOf: (id: number) => number | null;
  narrowVisible: (id: number) => void;
};

function filterOf(session: Parameters<typeof toSessionFilter>[0]): LogFilter {
  return sessionWire(toSessionFilter(session));
}

function pageFromQuery(req: LogQueryRequest): LogQueryPage | Promise<LogQueryPage> {
  return logQuery(req) as LogQueryPage | Promise<LogQueryPage>;
}

export function createViewportPage(state: LogUiState, deps: ViewportPageDeps): ViewportPageApi {
  async function pageOf(req: LogQueryRequest): Promise<LogQueryPage> {
    const raw = pageFromQuery(req);
    return "then" in (raw as object) ? await (raw as Promise<LogQueryPage>) : (raw as LogQueryPage);
  }
  /** 同步 mock（测试）返回对象；生产返回 Promise。保持同步路径可被同步断言。 */
  function pageSync(req: LogQueryRequest): LogQueryPage | Promise<LogQueryPage> {
    return pageFromQuery(req);
  }

  function baseReq(id: number, direction: LogQueryRequest["direction"], from_seq: number, to_seq: number, limit: number): LogQueryRequest | null {
    const session = sessionById(state, id);
    if (!session?.serial || !sessionCaptureIsLive(session) || session.fromSeq < 0) return null;
    return { serial: session.serial, filter: filterOf(session), from_seq, to_seq, limit, direction };
  }

  async function loadPage(id: number): Promise<void> {
    const req = baseReq(id, "backward", Number.MAX_SAFE_INTEGER, 0, docCap(state.bufferCapacity));
    if (!req) return;
    const raw = pageSync(req);
    const page = "then" in (raw as object) ? await (raw as Promise<LogQueryPage>) : (raw as LogQueryPage);
    if (page.ring_last_seq === 0 && page.ring_first_seq === 0 && page.lines.length === 0) {
      // 环已空（设备缓冲被清）：保留已画窗口并按新过滤重筛，不冲空。
      deps.narrowVisible(id);
      return;
    }
    deps.resetRingCursor(id);
    deps.setLastSeen(id, page.ring_last_seq);
    if (page.lines.length > 0) deps.appendRingLines(id, page.lines, true);
  }

  async function catchUp(id: number): Promise<void> {
    const session = sessionById(state, id);
    if (!session) return;
    const cap = docCap(state.bufferCapacity);
    const from = Math.max(0, session.lastSeenSeq + 1);
    const req = baseReq(id, "forward", from, Number.MAX_SAFE_INTEGER, cap);
    if (!req) return;
    const rawCatch = pageSync(req);
    const page = "then" in (rawCatch as object) ? await (rawCatch as Promise<LogQueryPage>) : (rawCatch as LogQueryPage);
    if (page.has_more) {
      // 积压超过一窗：直接取环尾一窗（视口只需最近内容）。
      await loadPage(id);
      return;
    }
    deps.setLastSeen(id, page.ring_last_seq);
    if (page.lines.length > 0) deps.appendRingLines(id, page.lines, false);
  }

  async function loadOlder(id: number): Promise<void> {
    const first = deps.firstSeqOf(id);
    if (first === null || first <= 0) return;
    const req = baseReq(id, "backward", first - 1, 0, PAGE);
    if (!req) return;
    const rawOlder = pageSync(req);
    const page = "then" in (rawOlder as object) ? await (rawOlder as Promise<LogQueryPage>) : (rawOlder as LogQueryPage);
    if (page.lines.length > 0) deps.prependWindow(id, page.lines);
  }

  async function loadNewer(id: number): Promise<void> {
    const last = deps.lastSeqOf(id);
    if (last === null) return;
    const req = baseReq(id, "forward", last + 1, Number.MAX_SAFE_INTEGER, PAGE);
    if (!req) return;
    const rawNewer = pageSync(req);
    const page = "then" in (rawNewer as object) ? await (rawNewer as Promise<LogQueryPage>) : (rawNewer as LogQueryPage);
    if (page.lines.length > 0) deps.appendRingLines(id, page.lines, false);
  }

  return { loadPage, catchUp, loadOlder, loadNewer };
}
