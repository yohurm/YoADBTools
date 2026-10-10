/**
 * 日志模块门面：工作区 + 窗口扇出 + 采集客户端。只依赖 @yohu/api。
 * 焦点由 View 经 bindSerial 注入默认设备；过滤定义在消费端，命中索引在环旁边（ADR-v6-041）。
 * 显示面板只由 workspace 写入当前页。
 * close / resumeFollow 以 capture 为准（先停采 / 再要尾页）。
 */

import { createStore } from "solid-js/store";
import { APP_SETTINGS_DEFAULT } from "@yohu/api";

import { createCapture } from "./capture";
import { createIngest } from "./ingest";
import { createWorkspace, type LogSessionState, type LogUiState } from "./workspace";

export type { DeviceUiState, LogSessionState } from "./workspace";
export { deviceSlice, SYSTEM_SESSION_TITLE } from "./workspace";

export function createLogStore() {
  const [state, setState] = createStore<LogUiState>({
    serial: null,
    devices: {},
    sessions: [] as LogSessionState[],
    activeSessionId: null,
    bufferCapacity: APP_SETTINGS_DEFAULT.buffer_capacity,
  });

  const workspace = createWorkspace(state, setState);
  const ingest = createIngest(workspace);
  const capture = createCapture(state, setState, workspace, ingest);

  return {
    state,
    ensureSession: workspace.ensureSession,
    createSession: workspace.createSession,
    renameSession: workspace.renameSession,
    duplicateSession: workspace.duplicateSession,
    setActive: workspace.setActive,
    patchFilter: workspace.patchFilter,
    setPaused: workspace.setPaused,
    trimPanels: workspace.trimPanels,
    catchUpSession: workspace.catchUpSession,
    bindPackageSessions: workspace.bindPackageSessions,
    assignDefaultSerial: workspace.assignDefaultSerial,
    discardView: workspace.discardView,
    flushPanel: workspace.flushPanel,
    flushDevicePanels: workspace.flushDevicePanels,
    setFollowing: workspace.setFollowing,
    ...capture,
  };
}

/** 模块级单例。 */
export const logStore = createLogStore();

export type LogStoreApi = ReturnType<typeof createLogStore>;
