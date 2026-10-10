/**
 * 采集客户端：窗口订阅 ↔ 每设备一路 logcat。
 * 引用只认 hold（capturing || starting，计数在 hold.ts）；世代对账在 capture-event。
 * 设备流停靠 captureState 事件。窗口标成采集中只在 log.capture.status 对账为 capturing 之后。
 * start 返回不写 capturing。退订走 workspace.unsubscribeSession（冻可见区）；扇出只认 capturing。
 * 切焦点不停其他设备流。闸门按 serial，禁止跨设备互等。
 * start 每次 await 后用 sessionId 重定位，禁止跨 await 缓存 idx。
 * 同窗口 adopt 续采：保留 fromSeq 与当前页，再向环要尾页；新流才清本窗口面板。
 * 窗口第一次点开始：fromSeq=0，按本窗口过滤向环要当前页，再跟新行。
 * 清空可见区走 discardView（推进 fromSeq）。清设备缓冲清环并 flush 面板。
 * 掉线只停采集；已画出的行保留。
 * 订阅可 dispose；测试与生产同一条链。
 */

import type { SetStoreFunction } from "solid-js/store";
import { documentIsHidden } from "@yohu/ui";
import {
  captureStateIsRunning,
  logCaptureStart,
  logCaptureStatus,
  logCaptureStop,
  logClearDevice,
  logExport,
  logPackageSnapshot,
  logPage,
  logProcessSnapshot,
  logWindowBind,
  logWindowLatch,
  logWindowRelease,
  onCaptureState,
  onDeviceOffline,
  onLogHits,
  onLogOverflow,
  onProcessIndex,
  onSettingsChanged,
  toWireFilter,
  YoLog,
} from "@yohu/api";
import type { ProcessEntry } from "@yohu/api";

import { applyCaptureEvent, captureDecisionIsIgnore, captureDecisionIsStopped } from "./capture-event";
import { foreignHoldCount, heldBoundSerials, holdCount, sessionHolds, sessionHoldsSerial } from "./hold";
import { sessionCaptureIsLive } from "./session-chrome";
import type { IngestApi } from "./ingest";
import { captureStarted, SESSION_NEVER_STARTED } from "./panel";
import { pageCap } from "./viewport";
import {
  deviceSlice,
  ensureDevice,
  sessionHasCapture,
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
  refreshProcesses: (serial?: string | null) => Promise<void>;
  refreshPackages: (serial?: string | null) => Promise<void>;
  exportSession: (path?: string) => Promise<string | null>;
  closeSession: (id: number) => void;
  closeOthers: (id: number) => void;
  resumeFollow: (id: number) => Promise<void>;
  detachFollow: (id: number) => void;
  requestPage: (id: number, index: number) => Promise<void>;
  serial: () => string | null;
  bufferCapacity: () => number;
  dispose: () => void;
};

export function createCapture(
  state: CaptureStore,
  setState: SetStoreFunction<CaptureStore>,
  workspace: WorkspaceApi,
  ingest: IngestApi,
): CaptureApi {
  let bindGen = 0;
  const pageGen = new Map<number, number>();
  const pullWanted = new Map<number, number>();
  const pullFlight = new Set<number>();
  const gates = new Map<string, Promise<void>>();
  const pending: Promise<() => void>[] = [];

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

  function sessionIdIs(session: { id: number }, id: number): boolean {
    return session.id === id;
  }

  function sessionById(id: number): LogSessionState | undefined {
    return state.sessions.find((s) => sessionIdIs(s, id));
  }

  function sessionMissing(idx: number): boolean {
    return idx < 0;
  }

  function sessionAt(idx: number): LogSessionState {
    return state.sessions[idx]!;
  }

  function logCaptureStatusFailed(e: unknown): void {
    console.error("log.capture.status 失败", e);
  }

  function logCaptureStopped(serial: string): void {
    YoLog.info("logs", "采集停止", { serial });
  }

  function deviceStillHeld(device: string): boolean {
    return holdCount(state.sessions, device) > 0;
  }

  function clearStarting(done: number): void {
    setState("sessions", done, { starting: false });
  }

  function bumpPage(id: number): number {
    const next = (pageGen.get(id) ?? 0) + 1;
    pageGen.set(id, next);
    return next;
  }

  async function pullPage(id: number, index: number): Promise<void> {
    pullWanted.set(id, index);
    if (pullFlight.has(id)) return;
    pullFlight.add(id);
    try {
      while (pullWanted.has(id)) {
        const next = pullWanted.get(id) ?? index;
        pullWanted.delete(id);
        const session = sessionById(id);
        if (!session) return;
        const count = pageCap(bufferCapacity());
        const page = await logPage({ window_id: id, index: next, count });
        if (pullWanted.has(id)) continue;
        workspace.applyPage(id, page, "replace");
      }
    } catch (e) {
      console.error("log.page 失败", e);
    } finally {
      pullFlight.delete(id);
      if (pullWanted.has(id)) {
        void pullPage(id, pullWanted.get(id) ?? index);
      }
    }
  }

  async function loadPage(id: number, mode: "replace" | "keep"): Promise<void> {
    const session = sessionById(id);
    if (!session?.serial || !sessionCaptureIsLive(session)) return;
    const gen = bumpPage(id);
    const page = await logWindowBind({
      id: session.id,
      serial: session.serial,
      filter: toWireFilter(session),
      from_seq: Math.max(0, session.fromSeq),
      following: session.following,
    });
    if (pageGen.get(id) !== gen) return;
    workspace.applyPage(id, page, mode);
  }

  workspace.setPageRequest(loadPage);

  const sessionIndex = (id: number): number => state.sessions.findIndex((s) => sessionIdIs(s, id));

  function activeSession(): LogSessionState | null {
    const id = state.activeSessionId;
    if (id === null) return null;
    return sessionById(id) ?? null;
  }

  /** 命令打到窗口绑定的设备；窗口还没绑则用焦点。显式 serial 优先。 */
  function commandSerial(
    session: { serial: string | null } | null,
    explicit?: string | null,
  ): string | null {
    return explicit ?? session?.serial ?? state.serial;
  }

  function heldSession(sessionId: number, device: string): LogSessionState | null {
    const session = sessionById(sessionId);
    if (!session || !sessionHoldsSerial(session, device)) return null;
    return session;
  }

  function windowIsLive(sessionId: number): boolean {
    const session = sessionById(sessionId);
    if (!session) return false;
    return sessionCaptureIsLive(session);
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

  function setPackages(device: string, packages: string[], degraded: boolean): void {
    ensureDevice(state, setState, device);
    setState("devices", device, { packages, packagesDegraded: degraded });
  }

  function stopWindowsOn(device: string): void {
    state.sessions.forEach((session) => {
      if (!sessionHoldsSerial(session, device)) return;
      workspace.unsubscribeSession(session.id);
    });
  }

  async function stopIfIdle(device: string): Promise<void> {
    if (deviceStillHeld(device)) return;
    logCaptureStopped(device);
    await logCaptureStop(device);
  }

  function applyEvent(device: string, generation: number, running: boolean): void {
    const currentGen = deviceSlice(state, device).generation;
    // 掉线后 generation=0 且无 hold：忽略过期 running，避免抬世代但不订窗
    if (currentGen === 0 && holdCount(state.sessions, device) === 0) return;
    const decision = applyCaptureEvent(currentGen, generation, running);
    if (captureDecisionIsIgnore(decision)) return;
    setDeviceGen(device, decision.generation);
    if (captureDecisionIsStopped(decision)) {
      YoLog.info("logs", "设备流已结束，窗口全部退订", {
        serial: device,
        generation: decision.generation,
      });
      stopWindowsOn(device);
    }
  }

  function setBufferCapacity(capacity: number): void {
    const next = Math.max(1, capacity);
    if (next === state.bufferCapacity) return;
    setState("bufferCapacity", next);
    workspace.trimPanels();
  }

  async function confirmStart(
    device: string,
    startedGen: number,
    sessionId: number,
    resumeWindow: boolean,
  ): Promise<void> {
    try {
      const status = await logCaptureStatus(device);
      if (!heldSession(sessionId, device)) return;
      if (status.generation >= startedGen) {
        setDeviceGen(device, status.generation);
      }
      if (!status.capturing) return;
      subscribeWindow(sessionId, device, resumeWindow);
      await loadPage(sessionId, "replace");
    } catch (e) {
      logCaptureStatusFailed(e);
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
        logCaptureStatusFailed(e);
      }
    }
  }

  async function startCapture(): Promise<void> {
    workspace.ensureSession();
    const session = activeSession();
    const current = commandSerial(session);
    if (!current || !session) return;
    const sessionId = session.id;
    return runExclusive(current, async () => {
      const idx = sessionIndex(sessionId);
      if (sessionMissing(idx)) return;
      if (!sessionAt(idx).serial) {
        setState("sessions", idx, { serial: current });
      }
      if (sessionCaptureIsLive(sessionAt(idx))) return;

      setState("sessions", idx, { starting: true });
      let opened = false;
      try {
        await refreshProcesses(current);
        if (!heldSession(sessionId, current)) return;
        const resumeWindow = captureStarted(state.sessions[sessionIndex(sessionId)]!.fromSeq);
        let startedGen = deviceSlice(state, current).generation;
        if (foreignHoldCount(state.sessions, current, sessionId) === 0) {
          opened = true;
          const result = await logCaptureStart(current);
          YoLog.info("logs", "采集已启动", {
            serial: current,
            generation: result.generation,
            adopted: result.adopted,
          });
          if (!heldSession(sessionId, current)) {
            await stopIfIdle(current);
            return;
          }
          startedGen = result.generation;
          setDeviceGen(current, result.generation);
          if (!result.adopted) {
            setOverflowed(current, false);
            workspace.flushPanel(sessionId);
          }
        }
        if (!heldSession(sessionId, current)) return;
        await confirmStart(current, startedGen, sessionId, resumeWindow);
        if (!windowIsLive(sessionId)) {
          const pending = sessionIndex(sessionId);
          if (!sessionMissing(pending) && sessionAt(pending).starting) {
            clearStarting(pending);
          }
          if (opened) await stopIfIdle(current);
        }
      } catch (e) {
        const done = sessionIndex(sessionId);
        if (!sessionMissing(done)) {
          clearStarting(done);
        }
        throw e;
      } finally {
        const done = sessionIndex(sessionId);
        if (!sessionMissing(done) && sessionAt(done).starting) {
          clearStarting(done);
        }
      }
    });
  }

  function subscribeWindow(sessionId: number, device: string, resumeWindow: boolean): void {
    const idx = sessionIndex(sessionId);
    if (sessionMissing(idx)) return;
    if (sessionAt(idx).serial !== device) return;
    if (resumeWindow) {
      setState("sessions", idx, {
        capturing: true,
        starting: false,
        serial: device,
        following: true,
        frozenThroughSeq: null,
      });
    } else {
      setState("sessions", idx, {
        capturing: true,
        starting: false,
        fromSeq: 0,
        serial: device,
        following: true,
        frozenThroughSeq: null,
      });
    }
  }

  async function stopCapture(): Promise<void> {
    const session = activeSession();
    const current = commandSerial(session);
    if (!current || !session) return;
    const sessionId = session.id;
    const shouldStop = sessionHolds(session) && foreignHoldCount(state.sessions, current, sessionId) === 0;
    workspace.unsubscribeSession(sessionId);
    const interrupt = shouldStop ? logCaptureStop(current) : Promise.resolve();
    if (shouldStop) {
      logCaptureStopped(current);
    } else {
      YoLog.info("logs", "窗口已退订，设备流由其他窗口保持", {
        serial: current,
        remaining: holdCount(state.sessions, current),
      });
    }
    return runExclusive(current, async () => {
      workspace.unsubscribeSession(sessionId);
      if (!shouldStop) return;
      await interrupt;
      try {
        const status = await logCaptureStatus(current);
        if (!status.capturing) {
          setDeviceGen(current, status.generation);
          stopWindowsOn(current);
        }
      } catch (e) {
        logCaptureStatusFailed(e);
      }
    });
  }

  function releaseDeviceIfIdle(device: string | null, hadHold: boolean): void {
    if (!device || !hadHold) return;
    if (deviceStillHeld(device)) return;
    void logCaptureStop(device).catch((e) => {
      console.error("关闭窗口后停采失败", e);
    });
  }

  function closeSession(id: number): void {
    const session = sessionById(id);
    const hadHold = session ? sessionHolds(session) : false;
    void logWindowRelease(id);
    workspace.closeSession(id);
    releaseDeviceIfIdle(session?.serial ?? null, hadHold);
  }

  function closeOthers(id: number): void {
    const closed = state.sessions.filter((s) => s.id !== id);
    workspace.closeOthers(id);
    const devices = new Set(heldBoundSerials(closed));
    for (const device of devices) {
      releaseDeviceIfIdle(device, true);
    }
  }

  async function clearVisible(id: number): Promise<void> {
    workspace.discardView(id);
  }

  async function clearDevice(): Promise<void> {
    const current = commandSerial(activeSession());
    if (!current) return;
    await logClearDevice(current);
    workspace.flushDevicePanels(current);
    state.sessions.forEach((session, i) => {
      if (session.serial !== current) return;
      if (sessionCaptureIsLive(session)) {
        setState("sessions", i, {
          fromSeq: 0,
          following: true,
          frozenThroughSeq: null,
          hitTotal: 0,
          pageIndex: 0,
          lastSeenSeq: SESSION_NEVER_STARTED,
        });
      }
    });
  }

  async function refreshProcesses(target?: string | null): Promise<void> {
    const current = commandSerial(activeSession(), target);
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

  async function refreshPackages(target?: string | null): Promise<void> {
    const current = commandSerial(activeSession(), target);
    if (!current) return;
    try {
      const packages = await logPackageSnapshot(current);
      setPackages(current, packages, false);
    } catch (e) {
      console.error("log.packageSnapshot 失败", e);
      setPackages(current, deviceSlice(state, current).packages, true);
    }
  }

  async function exportSession(path?: string): Promise<string | null> {
    const session = activeSession();
    if (!sessionHasCapture(session)) return null;
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
    for (const session of state.sessions) {
      if (!sessionCaptureIsLive(session) || session.serial !== device) continue;
      try {
        await loadPage(session.id, "replace");
      } catch (e) {
        console.error("log.window.bind 回补失败", e);
      }
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
    setDeviceGen(device, 0);
    setOverflowed(device, false);
    setProcessIndex(device, [], false);
    setPackages(device, [], false);
    stopWindowsOn(device);
  }

  const onUiResume = (): void => {
    if (documentIsHidden()) return;
    for (const session of state.sessions) {
      if (!sessionCaptureIsLive(session)) continue;
      void loadPage(session.id, "keep");
    }
  };

  const watch = (job: Promise<() => void>): void => {
    pending.push(job);
  };

  watch(
    onSettingsChanged((e) => {
      if (e.key === "buffer_capacity") {
        setBufferCapacity(e.settings.buffer_capacity);
      }
    }),
  );
  watch(
    onLogHits((e) => {
      bumpPage(e.window_id);
      ingest.onHits(e);
    }),
  );
  watch(onLogOverflow((e) => void onOverflow(e.serial)));
  watch(onProcessIndex((e) => onIndex(e)));
  watch(
    onCaptureState((e) => {
      applyEvent(e.serial, e.generation, captureStateIsRunning(e.state));
    }),
  );
  watch(onDeviceOffline((e) => onOffline(e.serial)));

  function listen(target: EventTarget, type: string, handler: () => void): () => void {
    target.addEventListener(type, handler);
    return () => target.removeEventListener(type, handler);
  }

  const stopVisibility = listen(document, "visibilitychange", onUiResume);
  const stopFocus = listen(window, "focus", onUiResume);

  function dispose(): void {
    stopVisibility();
    stopFocus();
    for (const job of pending) {
      void job.then((stop) => stop());
    }
    pending.length = 0;
  }

  return {
    bindSerial,
    setBufferCapacity,
    startCapture,
    stopCapture,
    clearVisible,
    clearDevice,
    refreshProcesses,
    refreshPackages,
    exportSession,
    closeSession,
    closeOthers,
    resumeFollow: (id: number): Promise<void> => {
      void logWindowLatch({ window_id: id, following: true }).catch((e) => {
        console.error("log.window.latch 失败", e);
      });
      return workspace.resumeFollow(id);
    },
    detachFollow: (id: number): void => {
      workspace.detachFollow(id);
      void logWindowLatch({ window_id: id, following: false }).catch((e) => {
        console.error("log.window.latch 失败", e);
      });
    },
    requestPage: (id: number, index: number): Promise<void> => pullPage(id, index),
    serial,
    bufferCapacity,
    dispose,
  };
}
