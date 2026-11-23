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
  onLogAppended,
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

  // 每设备一条拉取泵：一个设备一次只发一趟 log.range，拉到的同一批原始行分发给该设备
  // 所有在采窗口（各自过滤）。这样窗口数 N 不再放大 IPC/环克隆成本（ADR-v6-049 修订）。
  const DEV_PULL_BATCH = 5000;
  type DevPull = { busy: boolean; target: number };
  const devPulls = new Map<string, DevPull>();
  const sessionCursor = (s: { lastSeenSeq: number; fromSeq: number }): number =>
    s.lastSeenSeq >= s.fromSeq ? s.lastSeenSeq + 1 : Math.max(0, s.fromSeq);
  const liveWindowSessions = (serial: string) =>
    state.sessions.filter(
      (s) => s.serial === serial && sessionCaptureIsLive(s) && !s.paused && s.fromSeq >= 0,
    );
  async function pumpDevice(serial: string, st: DevPull): Promise<void> {
    try {
      for (let round = 0; round < 200; round += 1) {
        const sessions = liveWindowSessions(serial);
        if (sessions.length === 0) return;
        const target = st.target;
        const min = Math.min(...sessions.map(sessionCursor));
        if (min > target) return;
        let batch: LogLine[];
        try {
          const raw = logRange({ serial, from_seq: min, limit: DEV_PULL_BATCH }) as
            | LogLine[]
            | Promise<LogLine[]>;
          batch = Array.isArray(raw) ? raw : await raw;
        } catch (e) {
          console.error("log.range 拉取失败", e);
          return;
        }
        if (batch.length === 0) return;
        for (const s of liveWindowSessions(serial)) workspace.appendRingLines(s.id, batch);
        const last = batch[batch.length - 1]!.seq;
        if (last < min) return;
        if (batch.length < DEV_PULL_BATCH && st.target <= target) return;
      }
    } finally {
      st.busy = false;
    }
  }
  function scheduleDevice(serial: string, target: number): void {
    let st = devPulls.get(serial);
    if (!st) {
      st = { busy: false, target: 0 };
      devPulls.set(serial, st);
    }
    st.target = Math.max(st.target, target);
    if (st.busy) return; // 单飞：在途泵会读到更高 target 继续追
    st.busy = true;
    void pumpDevice(serial, st);
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
    onLogAppended((e) => {
      // 设备环前进到 last_seq：该设备只发一趟拉取，结果分发给所有在采窗口（过滤在 UI）。
      scheduleDevice(e.serial, e.last_seq);
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
