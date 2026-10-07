/**
 * 投屏模块状态：控制面走 mirror/state；出画以 mirror/painted 为准；画面在壳 HWND。
 * View 只报 avail；本层组装 MirrorLayout 并 invoke。
 */

import { createStore } from "solid-js/store";
import {
  APP_SETTINGS_DEFAULT,
  connectionOrUsb,
  dialogPickAccepted,
  dialogPickFailed,
  dialogSaveFile,
  errorText,
  deviceOfflineText,
  deviceSetNightMode,
  mirrorCloseControl,
  mirrorInject,
  mirrorLayout,
  mirrorPointer,
  mirrorScreenshot,
  mirrorStart,
  mirrorStop,
  onDeviceOffline,
  onMirrorPainted,
  onMirrorState,
  settingsSet,
  type AppSettings,
  type MirrorControlMessage,
  type MirrorPointerKind,
  type MirrorProtocol,
  type MirrorSessionState,
  type SettingKey,
  mirrorIsFailed,
  mirrorIsLive,
  mirrorIsStarting,
  mirrorSessionEnded,
  YoLog,
} from "@yohu/api";

import {
  assembleMirrorLayout,
  layoutInsetKey,
  shouldReportLayout,
  type AvailZone,
} from "./layout";
import { mirrorControlReady, mirrorSessionAddressable } from "./control-ready";
import type { MirrorScreenshotOutcome } from "./screenshot";

export type MirrorPhase = "idle" | "starting" | "live" | "failed";

export interface MirrorUiState {
  serial: string | null;
  connection: string;
  phase: MirrorPhase;
  generation: number;
  width: number;
  height: number;
  control: boolean;
  error: string | null;
  hasFrame: boolean;
  paused: boolean;
  fullscreen: boolean;
  readOnly: boolean;
  maxSize: number;
  videoBitRate: number;
  maxFps: number;
  protocol: MirrorProtocol;
  paintedFps: number;
  nightHub: boolean | null;
  nightPending: boolean | null;
  night: boolean | null;
}

function phaseOf(state: MirrorSessionState): MirrorPhase {
  if (mirrorIsStarting(state)) return "starting";
  if (mirrorIsLive(state)) return "live";
  if (mirrorIsFailed(state)) return "failed";
  return "idle";
}

function settingsSlice(settings: Pick<
  AppSettings,
  | "mirror_max_size"
  | "mirror_video_bit_rate"
  | "mirror_max_fps"
  | "mirror_protocol"
>): Pick<MirrorUiState, "maxSize" | "videoBitRate" | "maxFps" | "protocol"> {
  return {
    maxSize: settings.mirror_max_size,
    videoBitRate: settings.mirror_video_bit_rate,
    maxFps: settings.mirror_max_fps,
    protocol: settings.mirror_protocol,
  };
}

/** 阶段回到空闲。正在开始和失败不写这一份。 */
function phaseIdle(): Pick<MirrorUiState, "phase"> {
  return { phase: "idle" };
}

/** 错误收成空。掉线要写掉线句，不并。 */
function clearedError(): Pick<MirrorUiState, "error"> {
  return { error: null };
}

/** 控制通道关掉。停止不清这一项。 */
function controlOff(): Pick<MirrorUiState, "control"> {
  return { control: false };
}

/** 没有画面。实测帧率另收。 */
function frameOff(): Pick<MirrorUiState, "hasFrame"> {
  return { hasFrame: false };
}

/** 实测帧率归零。失败路径不写这一份。 */
function fpsOff(): Pick<MirrorUiState, "paintedFps"> {
  return { paintedFps: 0 };
}

/** 夜览等待收起。整份夜览清空和乐观失败各写这一项。 */
function pendingOff(): Pick<MirrorUiState, "nightPending"> {
  return { nightPending: null };
}

/** 宽或高已经给出。世代判断不并。 */
function edgeOpen(px: number): boolean {
  return px > 0;
}

function mirrorInfo(message: string, detail: unknown): void {
  YoLog.info("mirror", message, detail);
}

/** 画面会话收起：暂停、全屏、已出画、实测帧率。解绑、停止、结束和掉线都写这一份。 */
function clearedPlayback(): Pick<MirrorUiState, "hasFrame" | "paused" | "fullscreen" | "paintedFps"> {
  return {
    ...frameOff(),
    paused: false,
    fullscreen: false,
    ...fpsOff(),
  };
}

function idleAfterUnbind(): Pick<
  MirrorUiState,
  | "phase"
  | "generation"
  | "control"
  | "error"
  | "hasFrame"
  | "paused"
  | "fullscreen"
  | "paintedFps"
  | "nightHub"
  | "nightPending"
  | "night"
> {
  return {
    ...phaseIdle(),
    generation: 0,
    ...controlOff(),
    ...clearedError(),
    ...clearedPlayback(),
    nightHub: null,
    ...pendingOff(),
    night: null,
  };
}

export function createMirrorStore() {
  const [state, setState] = createStore<MirrorUiState>({
    serial: null,
    connection: connectionOrUsb(undefined),
    ...idleAfterUnbind(),
    width: 0,
    height: 0,
    readOnly: false,
    ...settingsSlice(APP_SETTINGS_DEFAULT),
  });

  let gate: Promise<void> = Promise.resolve();
  let sessionQualityTouched = false;
  let lastAvail: AvailZone | null = null;
  let lastInsetKey = "";
  const unlistens: Promise<() => void>[] = [];

  function runExclusive(fn: () => Promise<void>): Promise<void> {
    const run = gate.then(fn, fn);
    gate = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function exclusiveWhenBound(run: (serial: string) => Promise<void>): Promise<void> {
    const serial = state.serial;
    if (!serial) return;
    await runExclusive(() => run(serial));
  }

  function flagText(value: string | null) {
    return value ?? "";
  }

  function sessionFlags() {
    return {
      serial: flagText(state.serial),
      fullscreen: state.fullscreen,
      paused: state.paused,
      control: mirrorControlReady(state),
      hasDevice: Boolean(state.serial),
      failed: mirrorIsFailed(sessionPhase()),
      error: flagText(state.error),
    };
  }

  function flushLayout(): void {
    if (!lastAvail || !shouldReportLayout(lastAvail)) return;
    const payload = assembleMirrorLayout(lastAvail, sessionFlags());
    const key = layoutInsetKey(payload);
    if (key === lastInsetKey) return;
    lastInsetKey = key;
    mirrorInfo("layout", payload);
    void mirrorLayout(payload);
  }

  function reportAvail(avail: AvailZone): void {
    lastAvail = avail;
    flushLayout();
  }

  /** avail 离 DOM。隐藏必须上报；不去重清键当 HWND 修复。 */
  function leaveAvail(): void {
    if (!lastAvail) return;
    reportAvail({ ...lastAvail, visible: false });
  }

  /** 质量来自壳注入的 DeviceSession.settings，不另订 settings/changed。 */
  function applySettings(
    settings: Pick<
      AppSettings,
      | "mirror_max_size"
      | "mirror_video_bit_rate"
      | "mirror_max_fps"
      | "mirror_protocol"
    >,
  ): void {
    setState(settingsSlice(settings));
  }

  function bindConnection(connection: string): void {
    setState("connection", connectionOrUsb(connection));
  }

  function bindNight(hub: boolean | null): void {
    const pending = state.nightPending;
    const nextPending = pending !== null && hub === pending ? null : pending;
    setState({
      nightHub: hub,
      nightPending: nextPending,
      night: nextPending ?? hub,
    });
  }

  async function bindSerial(next: string | null): Promise<void> {
    const prev = state.serial;
    if (prev === next) return;
    if (prev && (mirrorIsLive(sessionPhase()) || mirrorIsStarting(sessionPhase()))) {
      await runExclusive(async () => {
        mirrorInfo("解绑停止", prev);
        await mirrorStop(prev);
      });
    }
    sessionQualityTouched = false;
    setState({
      serial: next,
      ...idleAfterUnbind(),
    });
    flushLayout();
  }

  /** 只读开关。开始时要不要控制、注入和指针各自判断，不并。 */
  function readOnlyNow(): boolean {
    return state.readOnly;
  }

  /** 当前阶段。失败、在播和正在启动各判各的，不并。 */
  function sessionPhase(): MirrorPhase {
    return state.phase;
  }

  /** 这次开始要不要开控制。画面此刻能否操作不并。 */
  function startWantsControl(): boolean {
    return !readOnlyNow();
  }

  /** 这次开始用的连接。日志键和 wire 键不并。 */
  function sessionConnection(): string {
    return state.connection;
  }

  async function start(): Promise<void> {
    await exclusiveWhenBound(async (serial) => {
      setState({ phase: "starting", ...clearedError(), ...frameOff(), ...fpsOff() });
      flushLayout();
      mirrorInfo("开始", {
        serial,
        connection: sessionConnection(),
        control: startWantsControl(),
        sessionQualityTouched,
      });
      try {
        const result = await mirrorStart({
          serial,
          control: startWantsControl(),
          connection: sessionConnection(),
          session_quality_touched: sessionQualityTouched,
        });
        setState({ generation: result.generation });
        mirrorInfo("start 返回", result);
      } catch (e) {
        const error = errorText(e);
        YoLog.error("mirror", "start 失败", error);
        setState({
          phase: "failed",
          error,
          ...frameOff(),
        });
        flushLayout();
      }
    });
  }

  async function stop(): Promise<void> {
    await exclusiveWhenBound(async (serial) => {
      mirrorInfo("停止", serial);
      await mirrorStop(serial);
      setState({
        ...phaseIdle(),
        ...clearedError(),
        ...clearedPlayback(),
      });
      flushLayout();
    });
  }

  async function inject(message: MirrorControlMessage): Promise<void> {
    const serial = mirrorSessionAddressable(state);
    if (!serial || readOnlyNow()) return;
    await mirrorInject({ serial, message });
  }

  function reportPointer(kind: MirrorPointerKind, x: number, y: number): void {
    const serial = mirrorSessionAddressable(state);
    if (!serial || readOnlyNow() || !state.control) return;
    void mirrorPointer({ serial, kind, x, y });
  }

  async function setReadOnly(next: boolean): Promise<void> {
    if (next === readOnlyNow()) return;
    const serial = mirrorSessionAddressable(state);
    if (!serial) {
      setState("readOnly", next);
      flushLayout();
      return;
    }
    if (next) {
      await mirrorCloseControl(serial);
      setState({ readOnly: true, ...controlOff() });
      flushLayout();
      return;
    }
    setState("readOnly", false);
    await stop();
    await start();
  }

  async function setDeviceNight(serial: string, night: boolean): Promise<void> {
    setState({ nightPending: night, night });
    try {
      await deviceSetNightMode(serial, night);
    } catch (e) {
      const hub = state.nightHub;
      setState({ ...pendingOff(), night: hub });
      throw e;
    }
  }

  async function persistQuality(
    key: Extract<
      SettingKey,
      | "mirror_max_size"
      | "mirror_video_bit_rate"
      | "mirror_max_fps"
      | "mirror_protocol"
    >,
    value: number | MirrorProtocol,
  ): Promise<void> {
    const updated = await settingsSet(key, value as never);
    applySettings(updated);
    sessionQualityTouched = true;
  }

  async function saveScreenshot(): Promise<MirrorScreenshotOutcome> {
    const serial = state.serial;
    if (!serial) return "cancelled";
    const picked = await dialogSaveFile({
      title: "保存截图",
      defaultPath: "mirror.png",
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (dialogPickFailed(picked)) return "failed";
    if (!dialogPickAccepted(picked)) return "cancelled";
    await mirrorScreenshot({ serial, path: picked.path });
    return "saved";
  }

  /** 状态、出画和掉线只认当前绑定的序列号。世代另判。 */
  function eventForBound(serial: string): boolean {
    return serial === state.serial;
  }

  function onBound<E extends { serial: string }>(handle: (e: E) => void): (e: E) => void {
    return (e) => {
      if (!eventForBound(e.serial)) return;
      handle(e);
    };
  }

  function commitPlaybackFlag(key: "paused" | "fullscreen", value: boolean): void {
    if (value === state[key]) return;
    setState(key, value);
    flushLayout();
  }

  function setPaused(paused: boolean): void {
    commitPlaybackFlag("paused", paused);
  }

  function setFullscreen(fullscreen: boolean): void {
    commitPlaybackFlag("fullscreen", fullscreen);
  }

  unlistens.push(
    onMirrorState(
      onBound((e) => {
        mirrorInfo("状态", {
          serial: e.serial,
          state: e.state,
          generation: e.generation,
          width: e.width,
          height: e.height,
          codec: e.codec,
          error: e.error,
        });
        setState({
          generation: e.generation,
          phase: phaseOf(e.state),
          ...(edgeOpen(e.width) && edgeOpen(e.height) ? { width: e.width, height: e.height } : {}),
          control: e.control,
          error: e.error ?? null,
        });
        if (mirrorSessionEnded(e.state)) {
          setState(clearedPlayback());
        }
        flushLayout();
      }),
    ),
  );
  unlistens.push(
    onMirrorPainted(
      onBound((e) => {
        if (e.generation && e.generation !== state.generation) return;
        if (!state.hasFrame) {
          mirrorInfo("首帧已绘制", {
            serial: e.serial,
            generation: e.generation,
            painted_fps: e.painted_fps,
          });
        }
        setState({
          hasFrame: true,
          paintedFps: e.painted_fps,
        });
        flushLayout();
      }),
    ),
  );
  unlistens.push(
    onDeviceOffline(
      onBound((e) => {
        setState({
          ...phaseIdle(),
          error: deviceOfflineText(e.serial),
          ...clearedPlayback(),
          ...controlOff(),
        });
        flushLayout();
      }),
    ),
  );

  const hot = (import.meta as { hot?: { dispose: (cb: () => void) => void } }).hot;
  hot?.dispose(() => {
    for (const p of unlistens) void p.then((unlisten) => unlisten());
  });

  return {
    state,
    bindSerial,
    bindConnection,
    bindNight,
    applySettings,
    start,
    stop,
    inject,
    setReadOnly,
    persistQuality,
    saveScreenshot,
    setDeviceNight,
    reportAvail,
    leaveAvail,
    reportPointer,
    setPaused,
    setFullscreen,
  };
}

export const mirrorStore = createMirrorStore();
