/**
 * 采集客户端装配：把页拉取（viewport-page）、启停编排（capture-orchestrator）与事件订阅（capture-subscriptions）
 * 拼成 `CaptureApi`，并暴露窗口命令（bind/clear/export/refresh/跟滚）。
 * 禁止在此 import DOM、window、document；窗口可见性由 View 调 `resumeVisible`。
 * 引用只认 hold（capturing || starting）；扇出只认 capturing；切焦点不停其他设备。
 * `bufferCapacity` 唯一写入口是 `setBufferCapacity`（settings/changed 订阅驱动）。
 */

import type { SetStoreFunction } from "solid-js/store";
import {
  logCaptureStatus,
  logClearDevice,
  logExport,
  type ExportResult,
} from "@yohu/api";

import { createCaptureOrchestrator, logCaptureStatusFailed } from "./capture-orchestrator";
import { createCaptureSubscriptions } from "./capture-subscriptions";
import { raiseDeviceGen } from "./device-projection";
import { sessionWire, toSessionFilter } from "./filter";
import { sessionById } from "./session-lifecycle";
import { sessionCaptureIsLive } from "./session-chrome";
import { createViewportPage } from "./viewport-page";
import { sessionHasCapture, type LogUiState, type WorkspaceApi } from "./workspace";

export type CaptureApi = {
  bindSerial: (next: string | null) => Promise<void>;
  setBufferCapacity: (capacity: number) => void;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<void>;
  clearVisible: (id: number) => Promise<void>;
  clearDevice: () => Promise<void>;
  refreshProcesses: (serial?: string | null) => Promise<void>;
  refreshPackages: (serial?: string | null) => Promise<void>;
  /** 导出指定窗口：显式接会话 id，返回条数回读结果（未采集返回 null）。 */
  exportSession: (id: number | null, path?: string) => Promise<ExportResult | null>;
  closeSession: (id: number) => void;
  closeOthers: (id: number) => void;
  resumeFollow: (id: number) => Promise<void>;
  detachFollow: (id: number) => void;
  /** View 在 visibilitychange / focus 且页面可见时调用：把所有在采窗口的页追到尾部。 */
  resumeVisible: () => void;
  /** 视口向上滚动：向 core 取上一页命中前插。 */
  loadOlder: (id: number) => Promise<void>;
  /** 视口向下滚动：向 core 取下一页命中追加。 */
  loadNewer: (id: number) => Promise<void>;
  serial: () => string | null;
  /** 命令目标的唯一回落链（View 不再自算）。 */
  commandSerialOf: (sessionId: number | null, explicit?: string | null) => string | null;
  dispose: () => void;
};

export function createCapture(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  workspace: WorkspaceApi,
): CaptureApi {
  let bindGen = 0;

  const viewport = createViewportPage(state, {
    resetRingCursor: (id) => workspace.resetRingCursor(id),
    setLastSeen: (id, seq) => workspace.setLastSeen(id, seq),
    appendRingLines: (id, lines, force) => workspace.appendRingLines(id, lines, force),
    prependWindow: (id, lines) => workspace.prependWindow(id, lines),
    firstSeqOf: (id) => workspace.firstSeqOf(id),
    lastSeqOf: (id) => workspace.lastSeqOf(id),
    narrowVisible: (id) => workspace.narrowVisible(id),
  });
  workspace.setPageRequest(viewport.loadPage);
  workspace.setCatchUpRequest(viewport.catchUp);

  const orchestrator = createCaptureOrchestrator(state, setState, { workspace, viewport });

  function setBufferCapacity(capacity: number): void {
    const next = Math.max(1, capacity);
    if (next === state.bufferCapacity) return;
    setState("bufferCapacity", next);
    workspace.trimPanels();
  }

  const subscriptions = createCaptureSubscriptions(state, setState, {
    workspace,
    viewport,
    orchestrator,
    setBufferCapacity,
  });

  const serial = (): string | null => state.serial;

  async function bindSerial(next: string | null): Promise<void> {
    if (next !== state.serial) {
      setState("serial", next);
    }
    workspace.assignDefaultSerial(next);
    const gen = ++bindGen;
    if (next && state.serial === next) {
      try {
        const status = await logCaptureStatus(next);
        if (gen !== bindGen || state.serial !== next) return;
        raiseDeviceGen(state, setState, next, status.generation);
      } catch (e) {
        logCaptureStatusFailed(e);
      }
    }
  }

  async function clearVisible(id: number): Promise<void> {
    workspace.discardView(id);
  }

  async function clearDevice(): Promise<void> {
    const session = sessionById(state, state.activeSessionId);
    const current = session?.serial ?? state.serial;
    if (!current) return;
    await logClearDevice(current);
    workspace.flushDevicePanels(current);
    workspace.resetAfterDeviceClear(current);
  }

  async function exportSession(id: number | null, path?: string): Promise<ExportResult | null> {
    const session = sessionById(state, id);
    if (!sessionHasCapture(session)) return null;
    return logExport({
      serial: session.serial,
      from_seq: session.fromSeq,
      // `pidSet` 在 toSessionFilter 里算一次，wire 侧复用同一份。
      filter: sessionWire(toSessionFilter(session)),
      path,
    });
  }

  /** 页面重新可见/聚焦：把每个仍在采的窗口按 keep 追到尾部（可见性判断在 View 层）。 */
  function catchUpAll(): void {
    for (const session of state.sessions) {
      if (!sessionCaptureIsLive(session)) continue;
      void viewport.catchUp(session.id);
    }
  }

  return {
    bindSerial,
    setBufferCapacity,
    startCapture: orchestrator.startCapture,
    stopCapture: orchestrator.stopCapture,
    clearVisible,
    clearDevice,
    refreshProcesses: orchestrator.refreshProcesses,
    refreshPackages: orchestrator.refreshPackages,
    exportSession,
    closeSession: orchestrator.closeSession,
    closeOthers: orchestrator.closeOthers,
    resumeFollow: (id: number): Promise<void> => workspace.resumeFollow(id),
    detachFollow: (id: number): void => {
      workspace.detachFollow(id);
    },
    resumeVisible: catchUpAll,
    loadOlder: (id: number): Promise<void> => viewport.loadOlder(id),
    loadNewer: (id: number): Promise<void> => viewport.loadNewer(id),
    serial,
    commandSerialOf: orchestrator.commandSerialOf,
    dispose: subscriptions.dispose,
  };
}
