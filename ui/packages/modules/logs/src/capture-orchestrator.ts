/**
 * 采集编排：IPC 启停、世代对账、每设备一路流的引用计数、会话关闭收口。
 * 只调用 device-projection（世代/溢出/索引写）与 viewport-page（取页）；不碰 DOM 生命周期、不碰事件订阅。
 * 闸门按 serial，禁止跨设备互等；start 每次 await 后用 sessionId 重定位。
 *
 * **采集相唯一写方**：`starting` / `capturing` 只在这里写。
 * - `confirmStart` 成功 → live（capturing=true, starting=false）
 * - `stopCapture` / `stopWindowsOn` → stopped（capturing=false, starting=false）
 * follow-state 只写 `following` / `frozenThroughSeq` / `fromSeq`，不写采集相。
 *
 * **世代唯一决策**：所有 status / start 结果的世代写入都走 `raiseDeviceGen`（只升不减），
 * 事件对账走 `applyCaptureEvent`；禁止「与起点 gen 比较」或无条件写。
 */

import type { SetStoreFunction } from "solid-js/store";
import {
  logCaptureStart,
  logCaptureStatus,
  logCaptureStop,
  logPackageSnapshot,
  logProcessSnapshot,
  YoLog,
  type ProcessEntry,
} from "@yohu/api";

import { applyCaptureEvent, captureDecisionIsIgnore, captureDecisionIsStopped } from "./capture-event";
import {
  deviceSlice,
  raiseDeviceGen,
  setOverflowed,
  setPackages,
  setProcessIndex,
} from "./device-projection";
import { foreignHoldCount, heldBoundSerials, holdCount, sessionHolds, sessionHoldsSerial } from "./hold";
import type { LogSessionState, LogUiState } from "./log-model";
import { captureStarted } from "./panel";
import { sessionCaptureIsLive } from "./session-chrome";
import { sessionAt, sessionById, sessionIndex, sessionMissing } from "./session-lifecycle";
import type { ViewportPageApi } from "./viewport-page";
import type { WorkspaceApi } from "./workspace";

/** status 对账上限。超过即视为「未确认」，清掉 `starting` 让按钮可再点。 */
export const CAPTURE_CONFIRM_TIMEOUT_MS = 5_000;

/** 状态对账失败只记一次（capture 的 bindSerial 也复用这一句）。 */
export function logCaptureStatusFailed(e: unknown): void {
  console.error("log.capture.status 失败", e);
}

/** 有界等待：超时返回 `null`，不吞原错误。 */
async function withinDeadline<T>(job: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([job, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export type CaptureOrchestratorApi = {
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<void>;
  closeSession: (id: number) => void;
  closeOthers: (id: number) => void;
  stopWindowsOn: (device: string) => void;
  applyEvent: (device: string, generation: number, running: boolean) => void;
  refreshProcesses: (target?: string | null) => Promise<void>;
  refreshPackages: (target?: string | null) => Promise<void>;
  /** 命令目标的唯一回落链：显式 serial → 窗口绑定 → 焦点。 */
  commandSerialOf: (sessionId: number | null, explicit?: string | null) => string | null;
};

export type CaptureOrchestratorDeps = {
  workspace: WorkspaceApi;
  viewport: ViewportPageApi;
};

export function createCaptureOrchestrator(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  deps: CaptureOrchestratorDeps,
): CaptureOrchestratorApi {
  const workspace = deps.workspace;
  const viewport = deps.viewport;
  const gates = new Map<string, Promise<void>>();

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

  function logCaptureStopped(serial: string): void {
    YoLog.info("logs", "采集停止", { serial });
  }

  function deviceStillHeld(device: string): boolean {
    return holdCount(state.sessions, device) > 0;
  }

  function activeSession(): LogSessionState | null {
    return sessionById(state, state.activeSessionId) ?? null;
  }

  /** 命令打到窗口绑定的设备；窗口还没绑则用焦点。显式 serial 优先。 */
  function commandSerialOf(sessionId: number | null, explicit?: string | null): string | null {
    const session = sessionById(state, sessionId);
    return explicit ?? session?.serial ?? state.serial;
  }

  function heldSession(sessionId: number, device: string): LogSessionState | null {
    const session = sessionById(state, sessionId);
    if (!session || !sessionHoldsSerial(session, device)) return null;
    return session;
  }

  function windowIsLive(sessionId: number): boolean {
    const session = sessionById(state, sessionId);
    return session !== undefined && sessionCaptureIsLive(session);
  }

  /** 采集相唯一写点之一：start 进行中。 */
  function markStarting(idx: number): void {
    setState("sessions", idx, { starting: true, capturing: false });
  }

  /** 采集相唯一写点之一：订阅已建立（live）。 */
  function markLive(idx: number): void {
    setState("sessions", idx, { capturing: true, starting: false });
  }

  /** 采集相唯一写点之一：未采（stopped）。 */
  function markStopped(idx: number): void {
    setState("sessions", idx, { capturing: false, starting: false });
  }

  function markStoppedById(sessionId: number): void {
    const idx = sessionIndex(state, sessionId);
    if (sessionMissing(idx)) return;
    markStopped(idx);
  }

  function stopWindowsOn(device: string): void {
    state.sessions.forEach((session) => {
      if (!sessionHoldsSerial(session, device)) return;
      const idx = sessionIndex(state, session.id);
      workspace.unsubscribeSession(session.id);
      if (!sessionMissing(idx)) markStopped(idx);
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
    raiseDeviceGen(state, setState, device, decision.generation);
    if (!captureDecisionIsStopped(decision)) return;
    YoLog.info("logs", "设备流已结束，窗口全部退订", {
      serial: device,
      generation: decision.generation,
    });
    stopWindowsOn(device);
  }

  async function confirmStart(
    device: string,
    sessionId: number,
    resumeWindow: boolean,
  ): Promise<void> {
    let status: Awaited<ReturnType<typeof logCaptureStatus>> | null;
    try {
      status = await withinDeadline(logCaptureStatus(device), CAPTURE_CONFIRM_TIMEOUT_MS);
    } catch (e) {
      logCaptureStatusFailed(e);
      return;
    }
    if (status === null) {
      // 未确认：清 starting，窗口不标 live（缺的是分支，不是延时兜底）。
      YoLog.warn("logs", "采集状态未确认", { serial: device, timeoutMs: CAPTURE_CONFIRM_TIMEOUT_MS });
      return;
    }
    if (!heldSession(sessionId, device)) return;
    raiseDeviceGen(state, setState, device, status.generation);
    if (!status.capturing) return;
    workspace.attachWindow(sessionId, device, resumeWindow);
    const idx = sessionIndex(state, sessionId);
    if (!sessionMissing(idx)) markLive(idx);
    await viewport.loadPage(sessionId);
  }

  async function startCapture(): Promise<void> {
    workspace.ensureSession();
    const session = activeSession();
    const current = commandSerialOf(session?.id ?? null);
    if (!current || !session) return;
    const sessionId = session.id;
    return runExclusive(current, async () => {
      const idx = sessionIndex(state, sessionId);
      if (sessionMissing(idx)) return;
      if (!sessionAt(state, idx).serial) {
        setState("sessions", idx, { serial: current });
      }
      if (sessionCaptureIsLive(sessionAt(state, idx))) return;

      markStarting(idx);
      let opened = false;
      try {
        await refreshProcesses(current);
        if (!heldSession(sessionId, current)) return;
        const resumeWindow = captureStarted(state.sessions[sessionIndex(state, sessionId)]!.fromSeq);
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
          raiseDeviceGen(state, setState, current, result.generation);
          if (!result.adopted) {
            setOverflowed(state, setState, current, false);
            workspace.flushPanel(sessionId);
          }
        }
        if (!heldSession(sessionId, current)) return;
        await confirmStart(current, sessionId, resumeWindow);
        if (!windowIsLive(sessionId)) {
          markStoppedById(sessionId);
          if (opened) await stopIfIdle(current);
        }
      } catch (e) {
        markStoppedById(sessionId);
        throw e;
      } finally {
        const done = sessionIndex(state, sessionId);
        if (!sessionMissing(done) && sessionAt(state, done).starting) {
          markStopped(done);
        }
      }
    });
  }

  async function stopCapture(): Promise<void> {
    const session = activeSession();
    const current = commandSerialOf(session?.id ?? null);
    if (!current || !session) return;
    const sessionId = session.id;
    const shouldStop = sessionHolds(session) && foreignHoldCount(state.sessions, current, sessionId) === 0;
    // 先退订本窗（去 hold），再决定是否停设备流；只退订一次。
    workspace.unsubscribeSession(sessionId);
    markStoppedById(sessionId);
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
      if (!shouldStop) return;
      await interrupt;
      try {
        const status = await logCaptureStatus(current);
        if (status.capturing) return;
        raiseDeviceGen(state, setState, current, status.generation);
        stopWindowsOn(current);
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
    const session = sessionById(state, id);
    const hadHold = session ? sessionHolds(session) : false;
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

  async function refreshProcesses(target?: string | null): Promise<void> {
    const current = commandSerialOf(state.activeSessionId, target);
    if (!current) return;
    try {
      const entries = await logProcessSnapshot(current);
      setProcessIndex(state, setState, current, entries, false);
      workspace.bindPackageSessions(current, entries);
    } catch (e) {
      console.error("log.processSnapshot 失败", e);
      setProcessIndex(state, setState, current, deviceSlice(state, current).processEntries, true);
    }
  }

  async function refreshPackages(target?: string | null): Promise<void> {
    const current = commandSerialOf(state.activeSessionId, target);
    if (!current) return;
    try {
      const packages = await logPackageSnapshot(current);
      setPackages(state, setState, current, packages, false);
    } catch (e) {
      console.error("log.packageSnapshot 失败", e);
      setPackages(state, setState, current, deviceSlice(state, current).packages, true);
    }
  }

  return {
    startCapture,
    stopCapture,
    closeSession,
    closeOthers,
    stopWindowsOn,
    applyEvent,
    refreshProcesses,
    refreshPackages,
    commandSerialOf,
  };
}
