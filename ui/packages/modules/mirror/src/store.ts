/**
 * 投屏模块状态：控制面走 mirror/state；出画以 mirror/painted 为准；画面在壳 HWND。
 * View 只报 avail；本层组装 MirrorLayout 并 invoke。
 */

import { createStore } from "solid-js/store";
import {
  APP_SETTINGS_DEFAULT,
  dialogSaveFile,
  errorText,
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
  YoLog,
} from "@yohu/api";

import {
  assembleMirrorLayout,
  layoutInsetKey,
  shouldReportLayout,
  type AvailZone,
} from "./layout";

export type MirrorPhase = "idle" | "starting" | "live" | "failed";

export interface MirrorUiState {
  serial: string | null;
  connection: string;
  phase: MirrorPhase;
  generation: number;
  width: number;
  height: number;
  codec: string;
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
  if (state === "starting") return "starting";
  if (state === "live") return "live";
  if (state === "failed") return "failed";
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

function idleAfterUnbind(): Pick<
  MirrorUiState,
  | "phase"
  | "generation"
  | "codec"
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
    phase: "idle",
    generation: 0,
    codec: "",
    control: false,
    error: null,
    hasFrame: false,
    paused: false,
    fullscreen: false,
    paintedFps: 0,
    nightHub: null,
    nightPending: null,
    night: null,
  };
}

export function createMirrorStore() {
  const [state, setState] = createStore<MirrorUiState>({
    serial: null,
    connection: "usb",
    phase: "idle",
    generation: 0,
    width: 0,
    height: 0,
    codec: "",
    control: false,
    error: null,
    hasFrame: false,
    paused: false,
    fullscreen: false,
    readOnly: false,
    maxSize: APP_SETTINGS_DEFAULT.mirror_max_size,
    videoBitRate: APP_SETTINGS_DEFAULT.mirror_video_bit_rate,
    maxFps: APP_SETTINGS_DEFAULT.mirror_max_fps,
    protocol: APP_SETTINGS_DEFAULT.mirror_protocol,
    paintedFps: 0,
    nightHub: null,
    nightPending: null,
    night: null,
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

  function sessionFlags() {
    const live = state.phase === "live";
    return {
      serial: state.serial ?? "",
      fullscreen: state.fullscreen,
      paused: state.paused,
      control: live && state.hasFrame && !state.readOnly && state.control,
      hasDevice: Boolean(state.serial),
      failed: state.phase === "failed",
      error: state.error ?? "",
    };
  }

  function flushLayout(): void {
    if (!lastAvail || !shouldReportLayout(lastAvail)) return;
    const payload = assembleMirrorLayout(lastAvail, sessionFlags());
    const key = layoutInsetKey(payload);
    if (key === lastInsetKey) return;
    lastInsetKey = key;
    YoLog.info("mirror", "layout", payload);
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
    setState("connection", connection || "usb");
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
    if (prev && (state.phase === "live" || state.phase === "starting")) {
      await runExclusive(async () => {
        YoLog.info("mirror", "解绑停止", prev);
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

  async function start(): Promise<void> {
    const serial = state.serial;
    if (!serial) return;
    await runExclusive(async () => {
      setState({ phase: "starting", error: null, hasFrame: false, paintedFps: 0 });
      flushLayout();
      YoLog.info("mirror", "开始", {
        serial,
        connection: state.connection,
        control: !state.readOnly,
        sessionQualityTouched,
      });
      try {
        const result = await mirrorStart({
          serial,
          control: !state.readOnly,
          connection: state.connection,
          session_quality_touched: sessionQualityTouched,
        });
        setState({ generation: result.generation });
        YoLog.info("mirror", "start 返回", result);
      } catch (e) {
        const error = errorText(e);
        YoLog.error("mirror", "start 失败", error);
        setState({
          phase: "failed",
          error,
          hasFrame: false,
        });
        flushLayout();
      }
    });
  }

  async function stop(): Promise<void> {
    const serial = state.serial;
    if (!serial) return;
    await runExclusive(async () => {
      YoLog.info("mirror", "停止", serial);
      await mirrorStop(serial);
      setState({
        phase: "idle",
        error: null,
        hasFrame: false,
        paused: false,
        fullscreen: false,
        paintedFps: 0,
      });
      flushLayout();
    });
  }

  async function inject(message: MirrorControlMessage): Promise<void> {
    const serial = state.serial;
    if (!serial || state.phase !== "live" || state.readOnly) return;
    await mirrorInject({ serial, message });
  }

  function reportPointer(kind: MirrorPointerKind, x: number, y: number): void {
    const serial = state.serial;
    if (!serial || state.phase !== "live" || state.readOnly || !state.control) return;
    void mirrorPointer({ serial, kind, x, y });
  }

  async function setReadOnly(next: boolean): Promise<void> {
    if (next === state.readOnly) return;
    const serial = state.serial;
    if (!serial || state.phase !== "live") {
      setState("readOnly", next);
      flushLayout();
      return;
    }
    if (next) {
      await mirrorCloseControl(serial);
      setState({ readOnly: true, control: false });
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
      setState({ nightPending: null, night: hub });
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

  async function saveScreenshot(): Promise<void> {
    const serial = state.serial;
    if (!serial) return;
    const path = await dialogSaveFile({
      title: "保存截图",
      defaultPath: "mirror.png",
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (!path) return;
    await mirrorScreenshot({ serial, path });
  }

  function setPaused(paused: boolean): void {
    if (paused === state.paused) return;
    setState("paused", paused);
    flushLayout();
  }

  function setFullscreen(fullscreen: boolean): void {
    if (fullscreen === state.fullscreen) return;
    setState("fullscreen", fullscreen);
    flushLayout();
  }

  unlistens.push(
    onMirrorState((e) => {
      if (e.serial !== state.serial) return;
      YoLog.info("mirror", "状态", {
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
        ...(e.width > 0 && e.height > 0 ? { width: e.width, height: e.height } : {}),
        codec: e.codec,
        control: e.control,
        error: e.error ?? null,
      });
      if (e.state === "stopped" || e.state === "failed") {
        setState({ paused: false, fullscreen: false, hasFrame: false, paintedFps: 0 });
      }
      flushLayout();
    }),
  );
  unlistens.push(
    onMirrorPainted((e) => {
      if (e.serial !== state.serial) return;
      if (e.generation && e.generation !== state.generation) return;
      if (!state.hasFrame) {
        YoLog.info("mirror", "首帧已绘制", {
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
  );
  unlistens.push(
    onDeviceOffline((e) => {
      if (e.serial !== state.serial) return;
      setState({
        phase: "idle",
        error: "设备已掉线",
        hasFrame: false,
        paused: false,
        fullscreen: false,
        control: false,
        paintedFps: 0,
      });
      flushLayout();
    }),
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
export type MirrorStoreApi = ReturnType<typeof createMirrorStore>;
