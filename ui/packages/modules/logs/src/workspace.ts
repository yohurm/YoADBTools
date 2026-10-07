/**
 * 日志会话工作区：窗口生命周期与可见区写入。不碰采集 IPC。
 * 点开始才订阅：fromSeq=0，按窗口过滤从当前环补齐。
 * 进程索引按 serial 分桶。
 *
 * 面板写入只有两条：applyAppend（入镜 / 补洞 / 重绑）与 projectWindow（改过滤）。
 * 清空走 discardView：推进 fromSeq，旧行不能再投影回来。
 * 退订走 unsubscribeSession：capturing=false 并冻可见区；扇出只认 capturing。
 * 空面板不能 detachFollow：没有已画行就没有底部。
 */

import type { SetStoreFunction } from "solid-js/store";
import {
  copyBinding,
  emptyBinding,
  matchesWireFilter,
  normalizeLevels,
  rebindPids,
  type LevelLetter,
  type LogLine,
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
  isFreshLine,
  lastSeqOf,
  mirrorCoversRange,
  nextDiscardFromSeq,
  projectWindow,
  seqBefore,
  SESSION_NEVER_STARTED,
  signalCountOf,
  trimRows,
} from "./panel";
import { sessionHolds } from "./hold";
import { sessionCaptureIsLive } from "./session-chrome";
import { scopeBadge, scopeIsPackage, sessionWire, toSessionFilter, type SessionScope } from "./filter";
import type { ViewRow } from "./stack";
import type { MirrorBank } from "./mirror";

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
  /** 与 core `buffer_capacity` 对齐：镜像与可见区同一上限 */
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
  patchFilter: (id: number, patch: SessionFilterPatch) => void;
  setPaused: (id: number, paused: boolean) => void;
  trimPanels: () => void;
    catchUpSession: (id: number) => void;
    unsubscribeSession: (id: number) => void;
    bindPackageSessions: (serial: string, entries?: readonly ProcessEntry[]) => void;
  assignDefaultSerial: (serial: string | null) => void;
  onDeviceLines: (serial: string, lines: readonly LogLine[]) => void;
  discardView: (id: number) => void;
  flushPanel: (id: number) => void;
  flushDevicePanels: (serial: string) => void;
  setFollowing: (id: number, following: boolean) => void;
  resumeFollow: (id: number) => void;
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
  mirrors: MirrorBank,
): WorkspaceApi {
  const sessionIndex = (id: number): number => state.sessions.findIndex((s) => s.id === id);
  const bufferCapacity = (): number => state.bufferCapacity;

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
    writePanel(idx, EMPTY_VIEW_ROWS, 0);
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
      binding: emptyBinding(),
    };
    if (scopeIsPackage(scope)) {
      session.binding = rebindPids(session.binding, processIndexOf(serial), scope.pkg, scope.includeChild);
    }
    return session;
  }

  function writePanel(idx: number, rows: ViewRow[], pendingCount: number): void {
    const session = state.sessions[idx];
    const visible = trimRows(rows, bufferCapacity());
    const signalCount = signalCountOf(visible);
    if (
      session &&
      session.visible === visible &&
      session.signalCount === signalCount &&
      session.pendingCount === pendingCount
    ) {
      return;
    }
    setState("sessions", idx, {
      visible,
      signalCount,
      pendingCount,
    });
  }

  function commitApply(idx: number, applied: { visible: ViewRow[]; pendingCount: number } | null): void {
    if (!applied) return;
    writePanel(idx, applied.visible, applied.pendingCount);
  }

  function extraFromMirror(session: LogSessionState, after: number): LogLine[] {
    if (!sessionHasCapture(session)) return [];
    const wire = sessionWire(toSessionFilter(session));
    return mirrors.of(session.serial).replay((line) => {
      if (!isFreshLine(line.seq, after, session.fromSeq)) return false;
      return matchesWireFilter(line, wire);
    }, bufferCapacity());
  }

  function appendToSession(id: number, lines: readonly LogLine[]): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(idx);
    const following = panelFollows(session.following, session.visible);
    if (following && !session.following) {
      markFollowing(idx);
    }
    commitApply(
      idx,
      applyAppend({
        visible: session.visible,
        lines,
        fromSeq: session.fromSeq,
        following,
        paused: session.paused,
        filter: toSessionFilter(session),
        cap: bufferCapacity(),
        pendingCount: following && !session.following ? 0 : session.pendingCount,
      }),
    );
  }

  function catchUpSession(id: number): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(idx);
    if (!sessionCaptureIsLive(session)) return;
    const after = visibleTail(session);
    appendToSession(id, extraFromMirror(session, after));
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

  function projectSession(id: number): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(idx);
    const mirror = session.serial ? mirrors.of(session.serial) : null;
    const covers = Boolean(
      sessionCaptureIsLive(session) &&
        mirror &&
        mirrorCoversRange(mirror.size(), mirror.lastSeqNumber(), session.fromSeq),
    );
    const source = covers ? extraFromMirror(session, seqBefore(session.fromSeq)) : [];
    const next = projectWindow({
      drawn: session.visible,
      source,
      sourceCoversRange: covers,
      fromSeq: session.fromSeq,
      following: session.following,
      frozenThroughSeq: session.frozenThroughSeq,
      filter: toSessionFilter(session),
      cap: bufferCapacity(),
      pendingCount: session.pendingCount,
    });
    writePanel(idx, next.visible, next.pendingCount);
  }

  function onDeviceLines(serial: string, lines: readonly LogLine[]): void {
    state.sessions.forEach((session) => {
      if (sessionOffSerial(session, serial) || !sessionCaptureIsLive(session)) return;
      appendToSession(session.id, lines);
    });
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
    const mirrorLast = session.serial ? mirrors.of(session.serial).lastSeqNumber() : -1;
    const fromSeq = nextDiscardFromSeq(session.fromSeq, session.visible.at(-1)?.line.seq, mirrorLast);
    setState("sessions", idx, {
      fromSeq,
      following: true,
      frozenThroughSeq: null,
    });
    clearPanel(idx);
  }

  function trimPanels(): void {
    const cap = bufferCapacity();
    state.sessions.forEach((session, idx) => {
      const trimmed = trimRows(session.visible, cap);
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

  function patchFilter(id: number, patch: SessionFilterPatch): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    if (Object.keys(patch).length === 0) return;
    const next =
      patch.levels !== undefined ? { ...patch, levels: normalizeLevels(patch.levels) } : patch;
    setState("sessions", idx, next);
    rebindIfPackage(idx);
    if (DISPLAY_KEYS.some((key) => key in patch)) {
      projectSession(id);
    }
  }

  function setPaused(id: number, paused: boolean): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    if (sessionAt(idx).paused === paused) return;
    setState("sessions", idx, { paused });
    if (!paused) catchUpSession(id);
  }

  function setFollowing(id: number, following: boolean): void {
    const idx = sessionIndex(id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(idx);
    if (session.following === following) return;
    if (following) {
      markFollowing(idx);
      catchUpSession(id);
      return;
    }
    if (!canFreezeFollow(session.visible)) return;
    setState("sessions", idx, {
      following: false,
      frozenThroughSeq: visibleTail(session),
    });
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
    onDeviceLines,
    discardView,
    flushPanel,
    flushDevicePanels,
    setFollowing,
    resumeFollow: (id) => setFollowing(id, true),
    detachFollow: (id) => setFollowing(id, false),
  };
}
