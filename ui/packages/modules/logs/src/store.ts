/**
 * 日志模块门面：工作区 + 窗口扇出 + 采集客户端。只依赖 @yohu/api。
 * 焦点由 View 经 bindSerial 注入默认设备；窗口/过滤/可见区在消费端（ADR-v6-006）。
 * 显示面板只由 workspace 写入。ingest 只推进镜像。
 * close / resumeFollow 以 capture 为准（先停采 / 再补快照）。
 */

import { createStore } from "solid-js/store";
import { APP_SETTINGS_DEFAULT } from "@yohu/api";

import { createCapture } from "./capture";
import { createIngest } from "./ingest";
import { MirrorBank } from "./mirror";
import { setColWidth as writeColWidth, type YoColWidths } from "@yohu/ui";
import { LOG_COLUMNS, defaultLogColWidths, type LogColKey, type LogColWidths } from "./layout";
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
    colWidths: defaultLogColWidths(),
  });

  const mirrors = new MirrorBank(APP_SETTINGS_DEFAULT.buffer_capacity);
  const workspace = createWorkspace(state, setState, mirrors);
  const ingest = createIngest(mirrors, workspace);
  const capture = createCapture(state, setState, mirrors, workspace, ingest);

  return {
    state,
    mirrors,
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
    detachFollow: workspace.detachFollow,
    setColWidth: (key: LogColKey, width: number) => {
      const spec = LOG_COLUMNS.find((col) => col.key === key);
      if (!spec) return;
      setState("colWidths", writeColWidth(state.colWidths as YoColWidths, spec, width) as LogColWidths);
    },
    ...capture,
  };
}

/** 模块级单例。 */
export const logStore = createLogStore();

export type LogStoreApi = ReturnType<typeof createLogStore>;
