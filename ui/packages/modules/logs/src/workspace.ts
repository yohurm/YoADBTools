/**
 * 日志会话工作区：窗口生命周期与可见区写入。不碰采集 IPC。
 * 点开始才订阅：fromSeq=0，按窗口过滤从当前环补齐。
 * 进程索引按 serial 分桶。
 *
 * 面板写入只有两条：applyAppend（入镜 / 补洞 / 重绑）与 projectWindow（改过滤）。
 * 清空走 discardView：推进 fromSeq，旧行不能再投影回来。
 * 空面板不能 detachFollow：没有已画行就没有底部。
 */

import type { SetStoreFunction } from "solid-js/store";
import type { LogLine, ProcessEntry } from "@yohu/api";

import {
  applyAppend,
  canFreezeFollow,
  isFreshLine,
  lastSeqOf,
  mirrorCoversRange,
  nextDiscardFromSeq,
  projectWindow,
  seqBefore,
  signalCountOf,
  trimRows,
} from "./panel";
import {
  copyBinding,
  emptyBinding,
  matchesLine,
  normalizeLevels,
  rebindPids,
  toSessionFilter,
  type LevelLetter,
  type PidBinding,
  type SessionScope,
  type ViewRow,
} from "./pipeline";
import type { LogColWidths } from "./layout";
import type { MirrorBank } from "./mirror";

/** 从未开始采集：入镜/补洞均跳过共享环。 */
export const SESSION_NEVER_STARTED = -1;

export const SYSTEM_SESSION_TITLE = "System";

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
  /** 清单列宽（px）；不进设置，模块单例内有效 */
  colWidths: LogColWidths;
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
      visible: [],
      binding: emptyBinding(),
    };
    if (scope.kind === "package") {
      session.binding = rebindPids(session.binding, processIndexOf(serial), scope.pkg, scope.includeChild);
    }
    return session;
  }

  function writePanel(idx: number, rows: ViewRow[], pendingCount: number): void {
    const visible = trimRows(rows, bufferCapacity());
    setState("sessions", idx, {
      visible,
      signalCount: signalCountOf(visible),
      pendingCount,
    });
  }

  function commitApply(idx: number, applied: { visible: ViewRow[]; pendingCount: number } | null): void {
    if (!applied) return;
    writePanel(idx, applied.visible, applied.pendingCount);
  }

  function extraFromMirror(session: LogSessionState, after: number): LogLine[] {
    if (session.fromSeq < 0 || !session.serial) return [];
    const filter = toSessionFilter(session);
    return mirrors.of(session.serial).replay((line) => {
      if (!isFreshLine(line.seq, after, session.fromSeq)) return false;
      return matchesLine(line, filter);
    }, bufferCapacity());
  }

  function appendToSession(id: number, lines: readonly LogLine[]): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    const session = state.sessions[idx]!;
    const following = session.following || !canFreezeFollow(session.visible);
    if (following && !session.following) {
      setState("sessions", idx, { following: true, frozenThroughSeq: null, pendingCount: 0 });
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
    if (idx < 0) return;
    const session = state.sessions[idx]!;
    const after = lastSeqOf(session.visible, session.fromSeq);
    appendToSession(id, extraFromMirror(session, after));
  }

  function projectSession(id: number): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    const session = state.sessions[idx]!;
    const mirror = session.serial ? mirrors.of(session.serial) : null;
    const covers = mirror
      ? mirrorCoversRange(mirror.size(), mirror.lastSeqNumber(), session.fromSeq)
      : false;
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
      if (session.serial !== serial || !session.capturing) return;
      appendToSession(session.id, lines);
    });
  }

  function flushPanel(id: number): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    writePanel(idx, [], 0);
  }

  function flushDevicePanels(serial: string): void {
    state.sessions.forEach((session) => {
      if (session.serial !== serial) return;
      flushPanel(session.id);
    });
  }

  function discardView(id: number): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    const session = state.sessions[idx]!;
    const mirrorLast = session.serial ? mirrors.of(session.serial).lastSeqNumber() : -1;
    const fromSeq = nextDiscardFromSeq(session.fromSeq, session.visible.at(-1)?.line.seq, mirrorLast);
    setState("sessions", idx, {
      fromSeq,
      following: true,
      frozenThroughSeq: null,
    });
    writePanel(idx, [], 0);
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
      if (session.scope.kind !== "package") return;
      if (session.serial !== serial) return;
      const binding = rebindPids(session.binding, index, session.scope.pkg, session.scope.includeChild);
      setState("sessions", idx, { binding });
      if (state.sessions[idx]!.following && !state.sessions[idx]!.paused) {
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
    if (idx < 0) return;
    setState("sessions", (s) => s.filter((x) => x.id !== id));
    if (state.activeSessionId === id) {
      const remaining = state.sessions.filter((x) => x.id !== id);
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
    if (idx < 0 || trimmed.length === 0) return;
    setState("sessions", idx, { title: trimmed });
  }

  function duplicateSession(id: number): number | null {
    const src = state.sessions.find((s) => s.id === id);
    if (!src) return null;
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
    const target = state.sessions.find((s) => s.id === id);
    if (!target) return;
    setState("sessions", [target]);
    setState("activeSessionId", id);
  }

  function rebindIfPackage(idx: number): void {
    const next = state.sessions[idx]!;
    if (next.scope.kind !== "package") return;
    const binding = rebindPids(
      next.binding,
      processIndexOf(next.serial),
      next.scope.pkg,
      next.scope.includeChild,
    );
    setState("sessions", idx, { binding });
  }

  function patchFilter(id: number, patch: SessionFilterPatch): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
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
    if (idx < 0) return;
    if (state.sessions[idx]!.paused === paused) return;
    setState("sessions", idx, { paused });
    if (!paused) catchUpSession(id);
  }

  function setFollowing(id: number, following: boolean): void {
    const idx = sessionIndex(id);
    if (idx < 0) return;
    const session = state.sessions[idx]!;
    if (session.following === following) return;
    if (following) {
      setState("sessions", idx, { following: true, frozenThroughSeq: null, pendingCount: 0 });
      catchUpSession(id);
      return;
    }
    if (!canFreezeFollow(session.visible)) return;
    setState("sessions", idx, {
      following: false,
      frozenThroughSeq: lastSeqOf(session.visible, session.fromSeq),
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
