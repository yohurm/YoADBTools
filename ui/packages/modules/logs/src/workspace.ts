/**
 * 日志工作区装配：只创建各切片并转发成 `WorkspaceApi`，自身不含投影 / 会话 / 跟滚算法。
 * 全文在设备环。窗口文档按 `buffer_capacity` 驻留过滤后的行，滚动不再按页回环。
 * 点开始才订阅：fromSeq=0，按窗口过滤把命中装进文档。
 *
 * 切片单向依赖：log-model ← device-projection ← session-lifecycle ← panel-projection ← follow-state ← 本文件。
 */

import type { SetStoreFunction } from "solid-js/store";
import type { LogLine, LogPage, ProcessEntry } from "@yohu/api";

import { assignDefaultSerial, bindPackageSessions } from "./device-projection";
import { createFollowState, type FollowStateApi } from "./follow-state";
import { createPanelProjection } from "./panel-projection";
import type { LogUiState, SessionFilterPatch } from "./log-model";
import { captureStarted, SESSION_NEVER_STARTED } from "./panel";
import {
  closeOthers,
  closeSession,
  createSession,
  duplicateSession,
  ensureSession,
  renameSession,
  sessionById,
  setActive,
  setColumnView,
  type ColumnViewPatch,
} from "./session-lifecycle";
import type { SessionScope } from "./filter";
import { sessionCaptureIsLive } from "./session-chrome";
import { docCap } from "./viewport";

export type { DeviceUiState, LogSessionState, LogUiState, SessionFilterPatch } from "./log-model";
export { SYSTEM_SESSION_TITLE } from "./log-model";
export { deviceSlice } from "./device-projection";
export { SESSION_NEVER_STARTED } from "./panel";

/** 窗口已绑定设备且至少开始过一次采集。导出与镜像补洞共用这一事实。 */
export function sessionHasCapture<T extends { serial: string | null; fromSeq: number }>(
  session: T | null | undefined,
): session is T & { serial: string } {
  return Boolean(session?.serial) && captureStarted(session?.fromSeq ?? SESSION_NEVER_STARTED);
}

/** 尚未绑定设备或尚未开始采集。导出拒绝时只显示这一句。 */
export const EXPORT_NEEDS_CAPTURE = "请先选择设备并采集日志";

export type WorkspaceApi = {
  ensureSession: () => number;
  createSession: (scope: SessionScope, title: string, serial?: string | null) => number;
  closeSession: (id: number) => void;
  closeOthers: (id: number) => void;
  renameSession: (id: number, title: string) => void;
  duplicateSession: (id: number) => number | null;
  setActive: (id: number) => void;
  /** 会话列视图单写：列宽 / 表头横滑。 */
  setColumnView: (id: number, patch: ColumnViewPatch) => void;
  patchFilter: (id: number, patch: SessionFilterPatch) => Promise<void>;
  setPaused: (id: number, paused: boolean) => Promise<void>;
  trimPanels: () => void;
  catchUpSession: (id: number) => Promise<void>;
  unsubscribeSession: (id: number) => void;
  bindPackageSessions: (serial: string, entries?: readonly ProcessEntry[]) => void;
  assignDefaultSerial: (serial: string | null) => void;
  /** 环拉取的一批原始行（未过滤）→ 交给窗口文档过滤/追加（游标随原始末 seq 前进）。 */
  appendRingLines: (id: number, lines: readonly LogLine[]) => void;
  applyPage: (id: number, page: LogPage) => void;
  setPageRequest: (fn: (id: number) => Promise<void>) => void;
  discardView: (id: number) => void;
  flushPanel: (id: number) => void;
  flushDevicePanels: (serial: string) => void;
  /** 清设备缓冲后重置该 serial 在采窗口（面板清空 + 游标转移交 follow-state）。 */
  resetAfterDeviceClear: (serial: string) => void;
  setFollowing: (id: number, following: boolean) => Promise<void>;
  resumeFollow: (id: number) => Promise<void>;
  detachFollow: (id: number) => void;
  /** 订阅窗口：只写 following / frozenThroughSeq / fromSeq，不写采集相。 */
  attachWindow: (id: number, device: string, resumeWindow: boolean) => void;
  /** 清设备缓冲后恢复跟滚。 */
  resumeFollowing: (idx: number) => void;
};

export function createWorkspace(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
): WorkspaceApi {
  const viewCap = (): number => docCap(state.bufferCapacity);
  let pageRequest: (id: number) => Promise<void> = async () => undefined;

  let follow!: FollowStateApi;
  const panel = createPanelProjection(state, setState, {
    viewCap,
    pageRequest: (id) => pageRequest(id),
    markFollowing: (idx) => follow.markFollowing(idx),
    resetFollowAfterDeviceClear: (idx) => follow.resetAfterDeviceClear(idx),
  });
  follow = createFollowState(state, setState, {
    clearPanel: (idx) => panel.clearPanel(idx),
    catchUpSession: (id) => panel.catchUpSession(id),
  });

  return {
    ensureSession: () => ensureSession(state, setState),
    createSession: (scope, title, serial) => createSession(state, setState, scope, title, serial),
    closeSession: (id) => closeSession(state, setState, id),
    closeOthers: (id) => closeOthers(state, setState, id),
    renameSession: (id, title) => renameSession(state, setState, id, title),
    duplicateSession: (id) => duplicateSession(state, setState, id),
    setActive: (id) => setActive(setState, id),
    setColumnView: (id, patch) => setColumnView(state, setState, id, patch),
    patchFilter: (id, patch) => panel.patchFilter(id, patch),
    setPaused: (id, paused) => panel.setPaused(id, paused),
    trimPanels: () => panel.trimPanels(),
    catchUpSession: (id) => panel.catchUpSession(id),
    unsubscribeSession: (id) => follow.unsubscribeSession(id),
    bindPackageSessions: (serial, entries) =>
      bindPackageSessions(state, setState, serial, entries, (id) => panel.catchUpSession(id)),
    assignDefaultSerial: (serial) => assignDefaultSerial(state, setState, serial),
    appendRingLines: (id, lines) => {
      const session = sessionById(state, id);
      if (!session || !sessionCaptureIsLive(session) || session.paused) return;
      panel.appendToSession(id, lines);
    },
    applyPage: (id, page) => panel.applyPage(id, page),
    setPageRequest: (fn) => {
      pageRequest = fn;
    },
    discardView: (id) => follow.discardView(id),
    flushPanel: (id) => panel.flushPanel(id),
    flushDevicePanels: (serial) => panel.flushDevicePanels(serial),
    resetAfterDeviceClear: (serial) => panel.resetAfterDeviceClear(serial),
    setFollowing: (id, following) => follow.setFollowing(id, following),
    resumeFollow: (id) => follow.setFollowing(id, true),
    detachFollow: (id) => follow.setFollowing(id, false),
    attachWindow: (id, device, resumeWindow) => follow.attachWindow(id, device, resumeWindow),
    resumeFollowing: (idx) => follow.resumeFollowing(idx),
  };
}
