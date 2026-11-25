/**
 * 日志模块门面：只装配 workspace + capture，并暴露 View 需要的契约（state + 动作 + 选择器）。
 * 内部 workspace.* 操作不经门面；过滤定义在消费端，命中索引在环旁边（ADR-v6-041）。
 * 选择器（deviceOf / appNamesOf / sessionById / commandSerialOf）是 View 读设备/会话切片的唯一出口。
 */

import { createStore } from "solid-js/store";
import { APP_SETTINGS_DEFAULT } from "@yohu/api";

import { createCapture } from "./capture";
import { appNamesOf, deviceSlice } from "./device-projection";
import { sessionById } from "./session-lifecycle";
import { createWorkspace, type LogSessionState, type LogUiState } from "./workspace";

export type { DeviceUiState, LogSessionState } from "./workspace";
export { SYSTEM_SESSION_TITLE, EXPORT_NEEDS_CAPTURE } from "./workspace";

export function createLogStore() {
  const [state, setState] = createStore<LogUiState>({
    serial: null,
    devices: {},
    sessions: [] as LogSessionState[],
    activeSessionId: null,
    bufferCapacity: APP_SETTINGS_DEFAULT.buffer_capacity,
  });

  const workspace = createWorkspace(state, setState);
  const capture = createCapture(state, setState, workspace);

  return {
    state,
    ensureSession: workspace.ensureSession,
    createSession: workspace.createSession,
    renameSession: workspace.renameSession,
    duplicateSession: workspace.duplicateSession,
    setActive: workspace.setActive,
    setColumnView: workspace.setColumnView,
    patchFilter: workspace.patchFilter,
    setPaused: workspace.setPaused,
    sessionById: (id: number | null) => sessionById(state, id),
    deviceOf: (serial: string | null | undefined) => deviceSlice(state, serial),
    appNamesOf: (serial: string | null) => appNamesOf(state, serial),
    ...capture,
  };
}

/** 模块级单例。 */
export const logStore = createLogStore();

export type LogStoreApi = ReturnType<typeof createLogStore>;
