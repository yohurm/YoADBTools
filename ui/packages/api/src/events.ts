/**
 * @yohu/api — AppEvent 订阅。只 listen 并原样转发已是 AppEvent 的负载。
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { EVENT_NAMES, type AppEvent } from "./types";

function on<K extends AppEvent["kind"]>(
  name: string,
  handler: (payload: Extract<AppEvent, { kind: K }>) => void,
): Promise<UnlistenFn> {
  return listen<Extract<AppEvent, { kind: K }>>(name, (event) => {
    handler(event.payload);
  });
}

export const onDevicesChanged = (h: (e: Extract<AppEvent, { kind: "devicesChanged" }>) => void) =>
  on(EVENT_NAMES.devicesChanged, h);

export const onDeviceOffline = (h: (e: Extract<AppEvent, { kind: "deviceOffline" }>) => void) =>
  on(EVENT_NAMES.deviceOffline, h);

export const onDeviceStatus = (h: (e: Extract<AppEvent, { kind: "deviceStatus" }>) => void) =>
  on(EVENT_NAMES.deviceStatus, h);

export const onLogBatch = (h: (e: Extract<AppEvent, { kind: "logBatch" }>) => void) =>
  on(EVENT_NAMES.logLines, h);

export const onLogOverflow = (h: (e: Extract<AppEvent, { kind: "logOverflow" }>) => void) =>
  on(EVENT_NAMES.logOverflow, h);

export const onProcessIndex = (h: (e: Extract<AppEvent, { kind: "processIndex" }>) => void) =>
  on(EVENT_NAMES.processIndex, h);

export const onCaptureState = (h: (e: Extract<AppEvent, { kind: "captureState" }>) => void) =>
  on(EVENT_NAMES.captureState, h);

export const onTransferProgress = (h: (e: Extract<AppEvent, { kind: "transferProgress" }>) => void) =>
  on(EVENT_NAMES.transferProgress, h);

export const onGroupProgress = (h: (e: Extract<AppEvent, { kind: "groupProgress" }>) => void) =>
  on(EVENT_NAMES.groupProgress, h);

export const onTaskSummary = (h: (e: Extract<AppEvent, { kind: "taskSummary" }>) => void) =>
  on(EVENT_NAMES.taskSummary, h);

export const onSettingsChanged = (h: (e: Extract<AppEvent, { kind: "settingsChanged" }>) => void) =>
  on(EVENT_NAMES.settingsChanged, h);

export const onMirrorState = (h: (e: Extract<AppEvent, { kind: "mirrorState" }>) => void) =>
  on(EVENT_NAMES.mirrorState, h);

export const onMirrorPainted = (h: (e: Extract<AppEvent, { kind: "mirrorPainted" }>) => void) =>
  on(EVENT_NAMES.mirrorPainted, h);

export const onUpdateProgress = (h: (e: Extract<AppEvent, { kind: "updateProgress" }>) => void) =>
  on(EVENT_NAMES.updateProgress, h);
