/**
 * 采集客户端：窗口订阅 ↔ 每设备一路 logcat。
 * 引用计数、世代、掉线、溢出回补在本文件；批次扇出在 ingest。
 * 切焦点不停其他设备流。闸门按 serial，禁止跨设备互等。
 * 同窗口 adopt 续采：保留 fromSeq 与可见区，只从 core 环补洞；新流才清镜像/本窗口面板。
 * 窗口第一次点开始：fromSeq=0，按本窗口过滤从当前环/镜像补齐，再跟新行。
 * 开始前先打一次 ps，包名窗口带着 pidSet 入镜。
 * 掉线只停采集、清镜像；已画出的行保留。
 * WebView 从冻结恢复时 replay 补 UI 镜像。
 */

import type { SetStoreFunction } from "solid-js/store";
import {
  logCaptureStart,
  logCaptureStatus,
  logCaptureStop,
  logClear,
  logClearDevice,
  logExport,
  logProcessSnapshot,
  logReplay,
  onCaptureState,
  onDeviceOffline,
  onLogBatch,
  onLogOverflow,
  onProcessIndex,
  onSettingsChanged,
  YoLog,
} from "@yohu/api";
import type { CaptureStatus, ProcessEntry } from "@yohu/api";

import { toWireFilter } from "./filter";
import type { IngestApi } from "./ingest";
import type { MirrorBank } from "./mirror";
import {
  deviceSlice,
  ensureDevice,
  type LogSessionState,
  type LogUiState,
  type WorkspaceApi,
} from "./workspace";

type CaptureStore = LogUiState;

export type CaptureApi = {
  bindSerial: (next: string | null) => Promise<void>;
  setBufferCapacity: (capacity: number) => void;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<void>;
  clearVisible: (id: number) => Promise<void>;
  clearDevice: () => Promise<void>;
  clearShared: () => Promise<void>;
  refreshProcesses: (serial?: string | null) => Promise<void>;
  exportSession: (path?: string) => Promise<string | null>;
  closeSession: (id: number) => void;
  closeOthers: (id: number) => void;
  resumeFollow: (id: number) => void;
  serial: () => string | null;
  bufferCapacity: () => number;
};

export function createCapture(
  state: CaptureStore,
  setState: SetStoreFunction<CaptureStore>,
  mirrors: MirrorBank,
  workspace: WorkspaceApi,
  ingest: IngestApi,
): CaptureApi {
  let bindGen = 0;
  const gates = new Map<string, Promise<void>>();
  const lastStoppedGen = new Map<string, number>();

  function runExclusive(serial: string, fn: () => Promise<void>): Promise<void> {
    const prev = gates.get(serial) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    gates.set(
      serial,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  const serial = (): string | null => state.serial;
  const bufferCapacity = (): number => state.bufferCapacity;
  const sessionIndex = (id: number): number => state.sessions.findIndex((s) => s.id === id);

  function activeSession(): LogSessionState | null {
    const id = state.activeSessionId;
    if (id === null) return null;
    return state.sessions.find((s) => s.id === id) ?? null;
  }

  function capturingCount(device: string): number {
    return state.sessions.filter((s) => s.serial === device && s.capturing).length;
  }

  function setDeviceGen(device: string, generation: number): void {
    ensureDevice(state, setState, device);
    setState("devices", device, "generation", generation);
  }

  function setOverflowed(device: string, overflowed: boolean): void {
    ensureDevice(state, setState, device);
    setState("devices", device, "overflowed", overflowed);
  }

  function setProcessIndex(device: string, entries: ProcessEntry[], degraded: boolean): void {
    ensureDevice(state, setState, device);
    setState("devices", device, { processEntries: entries, indexDegraded: degraded });
  }

  function stopWindowsOn(device: string): void {
    state.sessions.forEach((session, idx) => {
      if (session.serial !== device || !session.capturing) return;
      setState("sessions", idx, { capturing: false, starting: false });
    });
  }

  function applyEvent(device: string, generation: number, running: boolean): void {
    const stopped = lastStoppedGen.get(device) ?? 0;
    const currentGen = deviceSlice(state, device).generation;
    if (running) {
      if (generation <= stopped || generation < currentGen) return;
      setDeviceGen(device, generation);
      return;
    }
    if (generation < stopped) return;
    lastStoppedGen.set(device, generation);
    if (generation < currentGen) return;
    setDeviceGen(device, generation);
    stopWindowsOn(device);
  }

  function applyStatus(status: CaptureStatus): void {
    if (status.capturing) {
      if (status.generation > 0 && (lastStoppedGen.get(status.serial) ?? 0) >= status.generation) {
        lastStoppedGen.set(status.serial, status.generation - 1);
      }
      setDeviceGen(status.serial, status.generation);
      return;
    }
    const prev = Math.max(
      lastStoppedGen.get(status.serial) ?? 0,
      status.generation,
      deviceSlice(state, status.serial).generation,
    );
    lastStoppedGen.set(status.serial, prev);
    setDeviceGen(status.serial, status.generation);
    stopWindowsOn(status.serial);
  }

  function setBufferCapacity(capacity: number): void {
    const next = Math.max(1, capacity);
    mirrors.setCapacity(next);
    if (next === state.bufferCapacity) return;
    setState("bufferCapacity", next);
    workspace.trimPanels();
  }

  async function confirmStart(device: string, startedGen: number, sessionId: number): Promise<void> {
    try {
      const status = await logCaptureStatus(device);
      if (status.capturing || status.generation >= startedGen) {
        if (status.capturing) {
          if (status.generation > 0 && (lastStoppedGen.get(device) ?? 0) >= status.generation) {
            lastStoppedGen.set(device, status.generation - 1);
          }
          setDeviceGen(device, status.generation);
          await pullSnapshot(device);
          return;
        }
        applyStatus(status);
        const idx = sessionIndex(sessionId);
        if (idx >= 0 && state.sessions[idx]!.serial === device) {
          setState("sessions", idx, { capturing: false, starting: false });
        }
      }
    } catch (e) {
      console.error("log.capture.status 失败", e);
    }
  }

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
        setDeviceGen(next, status.generation);
      } catch (e) {
        console.error("log.capture.status 失败", e);
      }
    }
  }

  async function startCapture(): Promise<void> {
    workspace.ensureSession();
    const session = activeSession();
    if (!session) {
      throw new Error("请先选择设备");
    }
    const current = session.serial ?? state.serial;
    if (!current) {
      throw new Error("请先选择设备");
    }
    const sessionId = session.id;
    return runExclusive(current, async () => {
      const idx = sessionIndex(sessionId);
      if (idx < 0) return;
      const live = state.sessions[idx]!;
      if (!live.serial) {
        setState("sessions", idx, { serial: current });
      }
      if (state.sessions[idx]!.capturing) return;

      setState("sessions", idx, { starting: true });
      try {
        await refreshProcesses(current);
        const resumeWindow = state.sessions[idx]!.fromSeq >= 0;
        const already = capturingCount(current);
        let startedGen = deviceSlice(state, current).generation;
        if (already === 0) {
          const result = await logCaptureStart(current);
          YoLog.info("logs", "采集已启动", {
            serial: current,
            generation: result.generation,
            adopted: result.adopted,
          });
          startedGen = result.generation;
          setDeviceGen(current, result.generation);
          if (!result.adopted) {
            mirrors.clear(current);
            setOverflowed(current, false);
            workspace.clearPanel(sessionId);
          }
        }
        subscribeWindow(idx, current, sessionId, resumeWindow);
        await pullSnapshot(current);
        await confirmStart(current, startedGen, sessionId);
      } catch (e) {
        const done = sessionIndex(sessionId);
        if (done >= 0) {
          setState("sessions", done, { starting: false });
        }
        throw e;
      } finally {
        const done = sessionIndex(sessionId);
        if (done >= 0 && state.sessions[done]!.starting) {
          setState("sessions", done, { starting: false });
        }
      }
    });
  }

  function subscribeWindow(idx: number, device: string, sessionId: number, resumeWindow: boolean): void {
    if (resumeWindow) {
      setState("sessions", idx, { capturing: true, starting: false, serial: device });
    } else {
      setState("sessions", idx, {
        capturing: true,
        starting: false,
        fromSeq: 0,
        serial: device,
      });
    }
    workspace.catchUpSession(sessionId);
  }

  async function pullSnapshot(device: string): Promise<void> {
    try {
      const from = Math.max(0, mirrors.of(device).lastSeqNumber() + 1);
      const batch = await logReplay({ serial: device, from_seq: from, limit: bufferCapacity() });
      if (batch?.lines && batch.lines.length > 0) ingest.onBatch(batch);
    } catch (e) {
      console.error("log.replay 快照失败", e);
    }
  }

  async function stopCapture(): Promise<void> {
    const session = activeSession();
    const current = session?.serial ?? state.serial;
    if (!current || !session) return;
    const lastOnDevice = capturingCount(current) <= 1 && (session.capturing || session.starting);
    const interrupt = lastOnDevice ? logCaptureStop(current) : Promise.resolve();
    return runExclusive(current, async () => {
      const idx = sessionIndex(session.id);
      if (idx >= 0) {
        setState("sessions", idx, { capturing: false, starting: false });
      }
      if (!lastOnDevice) return;
      YoLog.info("logs", "采集停止", { serial: current });
      await interrupt;
      lastStoppedGen.set(
        current,
        Math.max(lastStoppedGen.get(current) ?? 0, deviceSlice(state, current).generation),
      );
      try {
        const status = await logCaptureStatus(current);
        if (!status.capturing) {
          setDeviceGen(current, status.generation);
          stopWindowsOn(current);
        }
      } catch (e) {
        console.error("log.capture.status 失败", e);
      }
    });
  }

  function releaseDeviceIfIdle(device: string | null, wasCapturing: boolean): void {
    if (!device || !wasCapturing) return;
    if (capturingCount(device) > 0) return;
    void logCaptureStop(device).catch((e) => {
      console.error("关闭窗口后停采失败", e);
    });
  }

  function closeSession(id: number): void {
    const session = state.sessions.find((s) => s.id === id);
    workspace.closeSession(id);
    releaseDeviceIfIdle(session?.serial ?? null, session?.capturing ?? false);
  }

  function closeOthers(id: number): void {
    const closed = state.sessions.filter((s) => s.id !== id);
    workspace.closeOthers(id);
    const devices = new Set(closed.filter((s) => s.capturing && s.serial).map((s) => s.serial!));
    for (const device of devices) {
      releaseDeviceIfIdle(device, true);
    }
  }

  async function clearVisible(id: number): Promise<void> {
    workspace.clearPanel(id);
  }

  async function clearDevice(): Promise<void> {
    const current = activeSession()?.serial ?? state.serial;
    if (!current) return;
    await logClearDevice(current);
    mirrors.clear(current);
    workspace.clearDevicePanels(current);
    state.sessions.forEach((session, i) => {
      if (session.serial !== current) return;
      if (session.capturing) setState("sessions", i, { fromSeq: 0 });
    });
  }

  async function clearShared(): Promise<void> {
    const current = activeSession()?.serial ?? state.serial;
    if (!current) return;
    await logClear(current);
    mirrors.clear(current);
    workspace.clearDevicePanels(current);
  }

  async function refreshProcesses(target?: string | null): Promise<void> {
    const current = target ?? activeSession()?.serial ?? state.serial;
    if (!current) return;
    try {
      const entries = await logProcessSnapshot(current);
      setProcessIndex(current, entries, false);
      workspace.bindPackageSessions(current, entries);
    } catch (e) {
      console.error("log.processSnapshot 失败", e);
      setProcessIndex(current, deviceSlice(state, current).processEntries, true);
    }
  }

  async function exportSession(path?: string): Promise<string | null> {
    const session = activeSession();
    if (!session?.serial || session.fromSeq < 0) return null;
    const result = await logExport({
      serial: session.serial,
      from_seq: session.fromSeq,
      filter: toWireFilter(session),
      path,
    });
    return result.path;
  }

  async function onOverflow(device: string): Promise<void> {
    setOverflowed(device, true);
    try {
      const from = mirrors.of(device).lastSeqNumber() + 1;
      const batch = await logReplay({ serial: device, from_seq: from, limit: bufferCapacity() });
      ingest.onBatch(batch);
    } catch (e) {
      console.error("log.replay 回补失败", e);
    }
  }

  function onIndex(snapshot: { serial: string; entries: ProcessEntry[]; degraded: boolean }): void {
    const tracked =
      state.devices[snapshot.serial] !== undefined ||
      state.serial === snapshot.serial ||
      state.sessions.some((s) => s.serial === snapshot.serial);
    if (!tracked) return;
    setProcessIndex(snapshot.serial, snapshot.entries, snapshot.degraded);
    workspace.bindPackageSessions(snapshot.serial, snapshot.entries);
  }

  function onOffline(device: string): void {
    lastStoppedGen.set(
      device,
      Math.max(lastStoppedGen.get(device) ?? 0, deviceSlice(state, device).generation),
    );
    setDeviceGen(device, 0);
    setOverflowed(device, false);
    setProcessIndex(device, [], false);
    mirrors.clear(device);
    stopWindowsOn(device);
  }

  void onSettingsChanged((e) => {
    if (e.key === "buffer_capacity") {
      setBufferCapacity(e.settings.buffer_capacity);
    }
  });
  void onLogBatch((e) => ingest.onBatch(e.batch));
  void onLogOverflow((e) => void onOverflow(e.serial));
  void onProcessIndex((e) => onIndex(e));
  void onCaptureState((e) => {
    applyEvent(e.serial, e.generation, e.state === "running");
  });
  void onDeviceOffline((e) => onOffline(e.serial));

  const inVitest = Boolean((import.meta as ImportMeta & { vitest?: unknown }).vitest);
  if (typeof document !== "undefined" && !inVitest) {
    const onUiResume = (): void => {
      if (document.hidden) return;
      const serials = new Set(
        state.sessions.filter((s) => s.capturing && s.serial).map((s) => s.serial!),
      );
      for (const device of serials) {
        void pullSnapshot(device);
      }
    };
    document.addEventListener("visibilitychange", onUiResume);
    window.addEventListener("focus", onUiResume);
  }

  return {
    bindSerial,
    setBufferCapacity,
    startCapture,
    stopCapture,
    clearVisible,
    clearDevice,
    clearShared,
    refreshProcesses,
    exportSession,
    closeSession,
    closeOthers,
    resumeFollow: (id: number): void => {
      workspace.resumeFollow(id);
      const session = state.sessions.find((s) => s.id === id);
      if (session?.serial && (session.capturing || session.starting)) {
        void pullSnapshot(session.serial);
      }
    },
    serial,
    bufferCapacity,
  };
}
