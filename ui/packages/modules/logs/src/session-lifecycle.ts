/**
 * 会话生命周期与唯一会话查找：ensure / create / close / closeOthers / setActive / rename / duplicate。
 * 会话查找（sessionIndex / sessionMissing / sessionAt / sessionById）只在此单源，其余层引用同一份。
 * `fromSeq` 只在这里写初值（`SESSION_NEVER_STARTED`）；运行期转移全在 `follow-state`。
 */

import type { SetStoreFunction } from "solid-js/store";
import { copyBinding, emptyBinding, rebindPids } from "@yohu/api";
import { trimmedTextPresent } from "@yohu/ui";

import { processIndexOf } from "./device-projection";
import { scopeIsPackage, type SessionScope } from "./filter";
import { SYSTEM_SESSION_TITLE, type LogSessionState, type LogUiState } from "./log-model";
import { EMPTY_VIEW_ROWS, SESSION_NEVER_STARTED } from "./panel";

let nextSessionId = 1;

export function sessionIndex(state: LogUiState, id: number): number {
  return state.sessions.findIndex((s) => s.id === id);
}

export function sessionMissing(idx: number): boolean {
  return idx < 0;
}

export function sessionAt(state: LogUiState, idx: number): LogSessionState {
  return state.sessions[idx]!;
}

export function sessionById(state: LogUiState, id: number | null): LogSessionState | undefined {
  if (id === null) return undefined;
  const idx = sessionIndex(state, id);
  if (sessionMissing(idx)) return undefined;
  return state.sessions[idx];
}

/** 会话不属于该设备。包名重绑与清设备面板共用同一判据。 */
export function sessionOffSerial(session: { serial: string | null }, serial: string): boolean {
  return session.serial !== serial;
}

export function makeSession(
  state: LogUiState,
  scope: SessionScope,
  title: string,
  serial: string | null,
): LogSessionState {
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
    docShift: 0,
    lastSeenSeq: SESSION_NEVER_STARTED,
    binding: emptyBinding(),
    colChars: {},
    headShift: 0,
  };
  if (scopeIsPackage(scope)) {
    session.binding = rebindPids(session.binding, processIndexOf(state, serial), scope.pkg, scope.includeChild);
  }
  return session;
}

/** 默认 System 窗口的唯一工厂：列表为空、以及关掉最后一个窗口时共用。 */
function ensureDefaultSession(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
): number {
  const session = makeSession(state, { kind: "all" }, SYSTEM_SESSION_TITLE, state.serial);
  setState("sessions", [session]);
  setState("activeSessionId", session.id);
  return session.id;
}

export function ensureSession(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
): number {
  if (state.sessions.length === 0) {
    return ensureDefaultSession(state, setState);
  }
  const active = state.activeSessionId;
  if (active !== null && sessionIndex(state, active) >= 0) return active;
  const first = state.sessions[0]!.id;
  setState("activeSessionId", first);
  return first;
}

export function createSession(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  scope: SessionScope,
  title: string,
  serial?: string | null,
): number {
  const session = makeSession(state, scope, title, serial !== undefined ? serial : state.serial);
  setState("sessions", (s) => [...s, session]);
  setState("activeSessionId", session.id);
  return session.id;
}

export function closeSession(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  id: number,
): void {
  const idx = sessionIndex(state, id);
  if (sessionMissing(idx)) return;
  const remaining = state.sessions.filter((x) => x.id !== id);
  setState("sessions", remaining);
  if (state.activeSessionId !== id) return;
  if (remaining.length === 0) {
    ensureDefaultSession(state, setState);
    return;
  }
  setState("activeSessionId", remaining[0]!.id);
}

export function setActive(setState: SetStoreFunction<LogUiState>, id: number): void {
  setState("activeSessionId", id);
}

/** 列宽 / 表头横滑的会话视图补丁。列宽整表替换（拖动提交给完整映射），headShift 单值。 */
export type ColumnViewPatch = {
  colChars?: Record<string, number>;
  headShift?: number;
};

/** 会话视图单写点：只改目标会话自身字段，切会话/关闭会话天然隔离，无需外部修剪。 */
export function setColumnView(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  id: number,
  patch: ColumnViewPatch,
): void {
  const idx = sessionIndex(state, id);
  if (sessionMissing(idx)) return;
  setState("sessions", idx, patch);
}

export function renameSession(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  id: number,
  title: string,
): void {
  const idx = sessionIndex(state, id);
  const trimmed = title.trim();
  if (sessionMissing(idx) || !trimmedTextPresent(trimmed)) return;
  setState("sessions", idx, { title: trimmed });
}

export function duplicateSession(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  id: number,
): number | null {
  const idx = sessionIndex(state, id);
  if (sessionMissing(idx)) return null;
  const src = sessionAt(state, idx);
  const copy = makeSession(state, { ...src.scope }, `${src.title} 副本`, src.serial);
  copy.levels = [...src.levels];
  copy.tagContains = src.tagContains;
  copy.keyword = src.keyword;
  copy.binding = copyBinding(src.binding);
  setState("sessions", (s) => [...s, copy]);
  setState("activeSessionId", copy.id);
  return copy.id;
}

export function closeOthers(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  id: number,
): void {
  const idx = sessionIndex(state, id);
  if (sessionMissing(idx)) return;
  const target = sessionAt(state, idx);
  setState("sessions", [target]);
  setState("activeSessionId", id);
}
