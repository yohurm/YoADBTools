/**
 * 采集事件订阅：settings 变更 / 命中扇出 / 溢出回补 / 进程索引 / 世代状态 / 掉线。
 * 只做「事件 → 调用编排与投影」；不持有 DOM 生命周期（窗口可见性由 View 调 store 动作）。
 */

import type { SetStoreFunction } from "solid-js/store";
import {
  captureStateIsRunning,
  onCaptureState,
  onDeviceOffline,
  onLogHits,
  onLogOverflow,
  onProcessIndex,
  onSettingsChanged,
  SETTING_KEYS,
  type ProcessEntry,
} from "@yohu/api";

import {
  resetDeviceGen,
  setOverflowed,
  setPackages,
  setProcessIndex,
} from "./device-projection";
import type { LogUiState } from "./log-model";
import { sessionCaptureIsLive } from "./session-chrome";
import type { CaptureOrchestratorApi } from "./capture-orchestrator";
import type { ViewportPageApi } from "./viewport-page";
import type { WorkspaceApi } from "./workspace";

export type CaptureSubscriptionsDeps = {
  workspace: WorkspaceApi;
  viewport: ViewportPageApi;
  orchestrator: CaptureOrchestratorApi;
  setBufferCapacity: (capacity: number) => void;
};

export type CaptureSubscriptionsApi = {
  dispose: () => void;
};

export function createCaptureSubscriptions(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  deps: CaptureSubscriptionsDeps,
): CaptureSubscriptionsApi {
  const { workspace, viewport, orchestrator } = deps;
  const pending: Promise<() => void>[] = [];

  async function onOverflow(device: string): Promise<void> {
    setOverflowed(state, setState, device, true);
    for (const session of state.sessions) {
      if (!sessionCaptureIsLive(session) || session.serial !== device) continue;
      try {
        await viewport.loadPage(session.id);
      } catch (e) {
        console.error("log.window.bind 回补失败", e);
      }
    }
  }

  function onIndex(snapshot: {
    serial: string;
    generation: number;
    entries: ProcessEntry[];
    degraded: boolean;
  }): void {
    const tracked =
      state.devices[snapshot.serial] !== undefined ||
      state.serial === snapshot.serial ||
      state.sessions.some((s) => s.serial === snapshot.serial);
    if (!tracked) return;
    // 迟到旧世代快照丢弃：进程索引与采集世代同一条「只升不减」。
    const current = state.devices[snapshot.serial]?.generation ?? 0;
    if (snapshot.generation < current) return;
    setProcessIndex(state, setState, snapshot.serial, snapshot.entries, snapshot.degraded);
    workspace.bindPackageSessions(snapshot.serial, snapshot.entries);
  }

  function onOffline(device: string): void {
    resetDeviceGen(state, setState, device);
    setOverflowed(state, setState, device, false);
    setProcessIndex(state, setState, device, [], false);
    setPackages(state, setState, device, [], false);
    orchestrator.stopWindowsOn(device);
  }

  const watch = (job: Promise<() => void>): void => {
    pending.push(job);
  };

  watch(
    onSettingsChanged((e) => {
      if (e.key === SETTING_KEYS.buffer_capacity) {
        deps.setBufferCapacity(e.settings.buffer_capacity);
      }
    }),
  );
  watch(
    onLogHits((e) => {
      viewport.bumpPage(e.window_id);
      workspace.applyHits(e);
    }),
  );
  watch(onLogOverflow((e) => void onOverflow(e.serial)));
  watch(onProcessIndex((e) => onIndex(e)));
  watch(
    onCaptureState((e) => {
      orchestrator.applyEvent(e.serial, e.generation, captureStateIsRunning(e.state));
    }),
  );
  watch(onDeviceOffline((e) => onOffline(e.serial)));

  function dispose(): void {
    for (const job of pending) {
      void job.then((stop) => stop());
    }
    pending.length = 0;
  }

  return { dispose };
}
