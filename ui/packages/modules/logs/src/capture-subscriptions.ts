/**
 * 采集事件订阅：settings 变更 / 命中扇出 / 溢出回补 / 进程索引 / 世代状态 / 掉线。
 * 只做「事件 → 调用编排与投影」；不持有 DOM 生命周期（窗口可见性由 View 调 store 动作）。
 * 命中空洞的判定与补页归文档状态机（`stream/log-window-reducer::applyAppend.gap`）与
 * 投影装配（`panel-projection.appendToSession`），本层只转发事件，不再自行判断连续性。
 */

import type { SetStoreFunction } from "solid-js/store";
import {
  captureStateIsRunning,
  logRange,
  onCaptureState,
  onDeviceOffline,
  onLogHits,
  onProcessIndex,
  onSettingsChanged,
  SETTING_KEYS,
  type LogLine,
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
import { sessionById } from "./session-lifecycle";
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
  const { workspace, orchestrator } = deps;
  const pending: Promise<() => void>[] = [];

  /**
   * 按 seq 游标从设备环把窗口拉齐到 `throughSeq`（含）。原始行由 UI 过滤。
   * 丢信号只影响延迟：下一次水位更高会一次性补齐；容量内不丢。
   */
  async function pullThrough(windowId: number, throughSeq: number): Promise<void> {
    const session = sessionById(state, windowId);
    if (!session?.serial || !sessionCaptureIsLive(session) || session.paused) return;
    let cursor =
      session.lastSeenSeq >= session.fromSeq ? session.lastSeenSeq + 1 : Math.max(0, session.fromSeq);
    for (let round = 0; round < 100 && cursor <= throughSeq; round += 1) {
      const current = sessionById(state, windowId);
      if (!current?.serial) return;
      let batch: LogLine[];
      try {
        const raw = logRange({ serial: current.serial, from_seq: cursor, limit: 2000 }) as
          | LogLine[]
          | Promise<LogLine[]>;
        batch = Array.isArray(raw) ? raw : await raw;
      } catch (e) {
        console.error("log.range 拉取失败", e);
        return;
      }
      if (batch.length === 0) return;
      workspace.appendRingLines(windowId, batch);
      const last = batch[batch.length - 1]!.seq;
      if (last < cursor) return;
      cursor = last + 1;
      if (batch.length < 2000) return;
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
      // 命中事件只是水位信号：把该窗口从环按 seq 游标拉齐到 last_seq（过滤在 UI）。
      void pullThrough(e.window_id, e.last_seq);
    }),
  );
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
