/**
 * 日志会话工作区：窗口生命周期与文档写入。不碰采集 IPC。
 * 全文在设备环。窗口文档按 `buffer_capacity` 驻留过滤后的行，滚动不再按页回环。
 * 点开始才订阅：fromSeq=0，按窗口过滤把命中装进文档。
 * 进程索引按 serial 分桶。
 *
 * 面板写入：applyHits（追加文档）与 applyPage（换文档 / 改过滤）。
 * 清空走 discardView：推进 fromSeq，旧行不能再投影回来。
 * 退订走 unsubscribeSession：capturing=false 并冻可见区；命中只认 capturing。
 * 空面板不能 detachFollow：没有已画行就没有底部。
 */

import type { SetStoreFunction } from "solid-js/store";
import {
  copyBinding,
  emptyBinding,
  normalizeLevels,
  rebindPids,
  type LevelLetter,
  type LogHits,
  type LogLine,
  type LogPage,
  type PidBinding,
  type ProcessEntry,
} from "@yohu/api";
import { trimmedTextPresent } from "@yohu/ui";

import {
  applyAppend,
  canFreezeFollow,
  panelFollows,
  captureStarted,
  EMPTY_VIEW_ROWS,
  keepMatching,
  lastSeqOf,
  nextDiscardFromSeq,
  panelFromLines,
  SESSION_NEVER_STARTED,
  signalCountOf,
  trimRows,
} from "./panel";
import { sessionHolds } from "./hold";
import { sessionCaptureIsLive } from "./session-chrome";
import { scopeBadge, scopeIsPackage, toSessionFilter, type SessionScope } from "./filter";
import type { ViewRow } from "./stack";
import { docCap } from "./viewport";

/** 窗口已绑定设备且至少开始过一次采集。导出与镜像补洞共用这一事实。 */
export function sessionHasCapture<T extends { serial: string | null; fromSeq: number }>(
  session: T | null | undefined,
): session is T & { serial: string } {
  return Boolean(session?.serial) && captureStarted(session?.fromSeq ?? SESSION_NEVER_STARTED);
}

/** 尚未绑定设备或尚未开始采集。导出拒绝时只显示这一句。 */
export const EXPORT_NEEDS_CAPTURE = "请先选择设备并采集日志";

export const SYSTEM_SESSION_TITLE = scopeBadge({ kind: "all" });

export interface LogSessionState {
  id: number;
  title: string;
  /** 窗口绑定的设备；空表示尚未选定 */
  serial: string | null;
  /** 本窗口是否在消费该设备的 logcat 扇出 */
  capturing: boolean;
  /** start IPC 进行中；空态/按钮不得再显示「未采集」 */
  starting: boolean;
  /** 本窗口起始序号；<0 表示从未开始，禁止从镜像补洞 */
  fromSeq: number;
  scope: SessionScope;
  /** 精确级别集合；空 = 不限。不是最低含以上。 */
  levels: LevelLetter[];
  tagContains: string;
  keyword: string;
  paused: boolean;
  /** 贴底跟滚；离开底部后冻结可见区，只累计 pendingCount */
  following: boolean;
  /** 离开底部时可见区末 seq；跟滚中为 null。过滤重建用它当冻结上限，不跟当前（可能已筛窄的）末行走。 */
  frozenThroughSeq: number | null;
  pendingCount: number;
  /** 当前可见面板上的信号行，由 visible 派生，禁止累计已裁掉的行 */
  signalCount: number;
  visible: ViewRow[];
  /** 命中索引长度。滚动比例用它。 */
  hitTotal: number;
  /** 当前页首行在命中索引中的位置。文档盖住全部命中时为 0。 */
  pageIndex: number;
  /** 从文档头裁掉的行数。视口用它把滚动偏移退回同样的行，已画出的行留在原地。 */
  docShift: number;
  /** 本窗口见过的最大 seq。清空游标推过它。 */
  lastSeenSeq: number;
  binding: PidBinding;
}

/** 显示过滤补丁。暂停只走 setPaused。 */
export type SessionFilterPatch = Partial<
  Pick<LogSessionState, "levels" | "tagContains" | "keyword" | "scope">
>;

/** 每设备一份投影：世代 / 溢出 / 进程索引 / 已安装包名。窗口只引用 serial，不共用全局数组。 */
export interface DeviceUiState {
  generation: number;
  overflowed: boolean;
  processEntries: ProcessEntry[];
  indexDegraded: boolean;
  /** 已安装包名（新建窗口包名检索；与 ps 进程索引分离） */
  packages: string[];
  packagesDegraded: boolean;
}

export interface LogUiState {
  /** 左侧焦点：新建窗口的默认设备，不等于唯一采集设备 */
  serial: string | null;
  /** 按 serial 分桶的设备投影 */
  devices: Record<string, DeviceUiState>;
  sessions: LogSessionState[];
  activeSessionId: number | null;
  /** 设备环条数上限，也是窗口文档条数上限。 */
  bufferCapacity: number;
}

export type WorkspaceApi = {
  ensureSession: () => number;
  createSession: (scope: SessionScope, title: string, serial?: string | null) => number;
  closeSession: (id: number) => void;
  closeOthers: (id: number) => void;
  renameSession: (id: number, title: string) => void;
  duplicateSession: (id: number) => number | null;
  setActive: (id: number) => void;
  patchFilter: (id: number, patch: SessionFilterPatch) => Promise<void>;
  setPaused: (id: number, paused: boolean) => Promise<void>;
  trimPanels: () => void;
    catchUpSession: (id: number) => Promise<void>;
    unsubscribeSession: (id: number) => void;
    bindPackageSessions: (serial: string, entries?: readonly ProcessEntry[]) => void;
  assignDefaultSerial: (serial: string | null) => void;
  applyHits: (hits: LogHits) => void;
  applyPage: (id: number, page: LogPage, mode: "replace" | "keep") => void;
  setPageRequest: (fn: (id: number, mode: "replace" | "keep") => Promise<void>) => void;
  discardView: (id: number) => void;
  flushPanel: (id: number) => void;
  flushDevicePanels: (serial: string) => void;
  setFollowing: (id: number, following: boolean) => Promise<void>;
  resumeFollow: (id: number) => Promise<void>;
  detachFollow: (id: number) => void;
};

let nextSessionId = 1;

export function emptyDevice(): DeviceUiState {
  return {
    generation: 0,
    overflowed: false,
    processEntries: [],
    indexDegraded: false,
    packages: [],
    packagesDegraded: false,
  };
}

export function deviceSlice(state: LogUiState, serial: string | null | undefined): DeviceUiState {
  if (!serial) return emptyDevice();
  return state.devices[serial] ?? emptyDevice();
}

export function ensureDevice(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  serial: string,
): void {
  if (state.devices[serial]) return;
  setState("devices", serial, emptyDevice());
}

const DISPLAY_KEYS: readonly (keyof SessionFilterPatch)[] = ["levels", "tagContains", "keyword", "scope"];

export function createWorkspace(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
): WorkspaceApi {
  const sessionIndex = (id: number): number => state.sessions.findIndex((s) => s.id === id);
  const bufferCapacity = (): number => state.bufferCapacity;
  const viewCap = (): number => docCap(bufferCapacity());
  let requestPage: (id: number, mode: "replace" | "keep") => Promise<void> = async () => undefined;

  function sessionMissing(idx: number): boolean {
    return idx < 0;
  }

  function sessionAt(idx: number): LogSessionState {
    return state.sessions[idx]!;
  }

  function sessionOffSerial(session: LogSessionState, serial: string): boolean {
    return session.serial !== serial;
  }

  function clearPanel(idx: number): void {
    setState("sessions", idx, {
      visible: EMPTY_VIEW_ROWS,
      signalCount: 0,
      pendingCount: 0,
      hitTotal: 0,
      pageIndex: 0,
      docShift: 0,
    });
  }

  function markFollowing(idx: number): void {
    setState("sessions", idx, { following: true, frozenThroughSeq: null, pendingCount: 0 });
  }

  function writeBinding(idx: number, binding: PidBinding): void {
    setState("sessions", idx, { binding });
  }

  function visibleTail(session: LogSessionState): number {
    return lastSeqOf(session.visible, session.fromSeq);
  }

  function processIndexOf(serial: string | null): readonly ProcessEntry[] {
    return deviceSlice(state, serial).processEntries;
  }

  function makeSession(scope: SessionScope, title: string, serial: string | null): LogSessionState {
    const session: LogSessionState = {
      id: nextSessionId++,
      title,
      serial,
      capturing: false,
      starting: false,
      fromSeq: SESSION_NEVER_STARTED,
      scope,
      levels: [],
      tagContains: "",
      keyword: "",
      paused: false,
      following: true,
      frozenThroughSeq: null,
      pendingCount: 0,
      signalCount: 0,
      visible: EMPTY_VIEW_ROWS,
      hitTotal: 0,
      pageIndex: 0,
      docShift: 0,
      lastSeenSeq: SESSION_NEVER_STARTED,
      binding: emptyBinding(),
    };
    if (scopeIsPackage(scope)) {
      session.binding = rebindPids(session.binding, processIndexOf(serial), scope.pkg, scope.includeChild);
    }
    return session;
  }

  function headDrop(previous: readonly ViewRow[], next: readonly ViewRow[]): number {
    if (previous.length === 0 || next.length === 0) return 0;
    const first = next[0]?.line.seq;
    if (first === undefined) return 0;
    const idx = previous.findIndex((row) => row.line.seq === first);
    return idx > 0 ? idx : 0;
  }

  function writePanel(idx: number, rows: ViewRow[], pendingCount: number, signals?: number): void {
    const session = state.sessions[idx];
    const visible = trimRows(rows, viewCap());
    const signalCount = signals ?? signalCountOf(visible);
    const docShift = (session?.docShift ?? 0) + (session ? headDrop(session.visible, visible) : 0);
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

  function placePage(idx: number, total: number, visibleLength: number, index?: number): void {
    const pageIndex = index ?? Math.max(0, total - visibleLength);
    setState("sessions", idx, { hitTotal: total, pageIndex });
  }

  function appendToSession(id: number, lines: readonly LogLine[], signals?: number): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(idx);
    const following = panelFollows(session.following, session.visible);
    if (following && !session.following) {
      markFollowing(idx);
    }
    const applied = applyAppend({
      visible: session.visible,
      lines,
      fromSeq: session.fromSeq,
      following,
      paused: session.paused,
      filter: toSessionFilter(session),
      cap: viewCap(),
      pendingCount: following && !session.following ? 0 : session.pendingCount,
    });
    if (!applied) return;
    writePanel(idx, applied.visible, applied.pendingCount, signals);
    noteSeq(idx, lines);
  }

  function catchUpSession(id: number): Promise<void> {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return Promise.resolve();
    if (!sessionCaptureIsLive(sessionAt(idx))) return Promise.resolve();
    return requestPage(id, "keep");
  }

  function unsubscribeSession(id: number): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(idx);
    if (!sessionHolds(session)) return;
    const freeze = canFreezeFollow(session.visible);
    setState("sessions", idx, {
      capturing: false,
      starting: false,
      ...(freeze
        ? {
            following: false,
            frozenThroughSeq: visibleTail(session),
          }
        : {}),
    });
  }

  function narrowDrawn(id: number): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(idx);
    const kept = keepMatching(session.visible, toSessionFilter(session));
    const next = panelFromLines(kept, viewCap());
    writePanel(idx, next.visible, session.pendingCount, next.signalCount);
  }

  function applyHits(hits: LogHits): void {
    const idx = sessionIndex(hits.window_id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(idx);
    if (!sessionCaptureIsLive(session)) return;
    if (session.paused) {
      setState("sessions", idx, { hitTotal: hits.total, signalCount: hits.signals });
      return;
    }
    const following = panelFollows(session.following, session.visible);
    if (!following && hits.tail.length === 0) {
      setState("sessions", idx, {
        pendingCount: session.pendingCount + hits.appended,
        hitTotal: hits.total,
        signalCount: hits.signals,
      });
      return;
    }
    appendToSession(hits.window_id, hits.tail, hits.signals);
    const drawn = state.sessions[idx]?.visible.length ?? 0;
    if (following) {
      placePage(idx, hits.total, drawn);
    } else {
      setState("sessions", idx, { hitTotal: hits.total, signalCount: hits.signals });
    }
  }

  function applyPage(id: number, page: LogPage, mode: "replace" | "keep"): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(idx);
    if (page.lines.length === 0 && page.total === 0 && session.visible.length > 0) {
      return;
    }
    void mode;
    const next = panelFromLines(page.lines, viewCap());
    const pending = session.following ? page.pending : session.pendingCount;
    writePanel(idx, next.visible, pending, page.signals);
    placePage(idx, page.total, next.visible.length, page.index);
    noteSeq(idx, page.lines);
  }

  function flushPanel(id: number): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    clearPanel(idx);
  }

  function flushDevicePanels(serial: string): void {
    state.sessions.forEach((session) => {
      if (sessionOffSerial(session, serial)) return;
      flushPanel(session.id);
    });
  }

  function discardView(id: number): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(idx);
    const fromSeq = nextDiscardFromSeq(session.fromSeq, session.visible.at(-1)?.line.seq, session.lastSeenSeq);
    setState("sessions", idx, {
      fromSeq,
      following: true,
      frozenThroughSeq: null,
    });
    clearPanel(idx);
  }

  function trimPanels(): void {
    state.sessions.forEach((session, idx) => {
      const trimmed = trimRows(session.visible, viewCap());
      if (trimmed.length === session.visible.length) return;
      writePanel(idx, trimmed, session.pendingCount);
    });
  }

  function bindPackageSessions(serial: string, entries?: readonly ProcessEntry[]): void {
    const index = entries ?? processIndexOf(serial);
    state.sessions.forEach((session, idx) => {
      if (!scopeIsPackage(session.scope)) return;
      if (sessionOffSerial(session, serial)) return;
      const binding = rebindPids(session.binding, index, session.scope.pkg, session.scope.includeChild);
      writeBinding(idx, binding);
      if (sessionCaptureIsLive(sessionAt(idx)) && !sessionAt(idx).paused) {
        catchUpSession(session.id);
      }
    });
  }

  function assignDefaultSerial(serial: string | null): void {
    state.sessions.forEach((session, idx) => {
      if (session.serial === null) {
        setState("sessions", idx, { serial });
      }
    });
  }

  function ensureSession(): number {
    if (state.sessions.length === 0) {
      const session = makeSession({ kind: "all" }, SYSTEM_SESSION_TITLE, state.serial);
      setState("sessions", [session]);
      setState("activeSessionId", session.id);
      return session.id;
    }
    const active = state.activeSessionId;
    if (active !== null && sessionIndex(active) >= 0) return active;
    const first = state.sessions[0]!.id;
    setState("activeSessionId", first);
    return first;
  }

  function createSession(scope: SessionScope, title: string, serial?: string | null): number {
    const session = makeSession(scope, title, serial !== undefined ? serial : state.serial);
    setState("sessions", (s) => [...s, session]);
    setState("activeSessionId", session.id);
    return session.id;
  }

  function closeSession(id: number): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    const remaining = state.sessions.filter((x) => x.id !== id);
    setState("sessions", remaining);
    if (state.activeSessionId === id) {
      if (remaining.length === 0) {
        const fresh = makeSession({ kind: "all" }, SYSTEM_SESSION_TITLE, state.serial);
        setState("sessions", [fresh]);
        setState("activeSessionId", fresh.id);
      } else {
        setState("activeSessionId", remaining[0]!.id);
      }
    }
  }

  function setActive(id: number): void {
    setState("activeSessionId", id);
  }

  function renameSession(id: number, title: string): void {
    const idx = sessionIndex(id);
    const trimmed = title.trim();
    if (sessionMissing(idx) || !trimmedTextPresent(trimmed)) return;
    setState("sessions", idx, { title: trimmed });
  }

  function duplicateSession(id: number): number | null {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return null;
    const src = sessionAt(idx);
    const copy = makeSession({ ...src.scope }, `${src.title} 副本`, src.serial);
    copy.levels = [...src.levels];
    copy.tagContains = src.tagContains;
    copy.keyword = src.keyword;
    copy.paused = false;
    copy.following = true;
    copy.frozenThroughSeq = null;
    copy.capturing = false;
    copy.starting = false;
    copy.fromSeq = SESSION_NEVER_STARTED;
    copy.binding = copyBinding(src.binding);
    setState("sessions", (s) => [...s, copy]);
    setState("activeSessionId", copy.id);
    return copy.id;
  }

  function closeOthers(id: number): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    const target = sessionAt(idx);
    setState("sessions", [target]);
    setState("activeSessionId", id);
  }

  function rebindIfPackage(idx: number): void {
    const next = sessionAt(idx);
    if (!scopeIsPackage(next.scope)) return;
    const binding = rebindPids(
      next.binding,
      processIndexOf(next.serial),
      next.scope.pkg,
      next.scope.includeChild,
    );
    writeBinding(idx, binding);
  }

  async function patchFilter(id: number, patch: SessionFilterPatch): Promise<void> {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    if (Object.keys(patch).length === 0) return;
    const next =
      patch.levels !== undefined ? { ...patch, levels: normalizeLevels(patch.levels) } : patch;
    setState("sessions", idx, next);
    rebindIfPackage(idx);
    if (!DISPLAY_KEYS.some((key) => key in patch)) return;
    narrowDrawn(id);
    if (sessionCaptureIsLive(sessionAt(sessionIndex(id)))) {
      await requestPage(id, "replace");
    }
  }

  async function setPaused(id: number, paused: boolean): Promise<void> {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    if (sessionAt(idx).paused === paused) return;
    setState("sessions", idx, { paused });
    if (!paused) await requestPage(id, "keep");
  }

  function setFollowing(id: number, following: boolean): Promise<void> {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return Promise.resolve();
    const session = sessionAt(idx);
    if (session.following === following) return Promise.resolve();
    if (following) {
      markFollowing(idx);
      return catchUpSession(id);
    }
    if (!canFreezeFollow(session.visible)) return Promise.resolve();
    setState("sessions", idx, {
      following: false,
      frozenThroughSeq: visibleTail(session),
    });
    return Promise.resolve();
  }

  return {
    ensureSession,
    createSession,
    closeSession,
    closeOthers,
    renameSession,
    duplicateSession,
    setActive,
    patchFilter,
    setPaused,
    trimPanels,
    catchUpSession,
    unsubscribeSession,
    bindPackageSessions,
    assignDefaultSerial,
    applyHits,
    applyPage,
    setPageRequest: (fn) => {
      requestPage = fn;
    },
    discardView,
    flushPanel,
    flushDevicePanels,
    setFollowing,
    resumeFollow: (id) => setFollowing(id, true),
    detachFollow: (id) => setFollowing(id, false),
  };
}
