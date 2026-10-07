import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mirrorStart: vi.fn(),
  mirrorStop: vi.fn(),
  mirrorInject: vi.fn(),
  mirrorCloseControl: vi.fn(),
  mirrorLayout: vi.fn(),
  mirrorPointer: vi.fn(),
  mirrorScreenshot: vi.fn(),
  deviceSetNightMode: vi.fn(),
  settingsSet: vi.fn(),
  dialogSaveFile: vi.fn(),
  stateHandlers: [] as ((e: {
    serial: string;
    generation: number;
    state: string;
    width: number;
    height: number;
    codec: string;
    control: boolean;
    error?: string;
  }) => void)[],
  paintedHandlers: [] as ((e: { serial: string; generation: number; painted_fps: number }) => void)[],
  offlineHandlers: [] as ((e: { serial: string }) => void)[],
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  return {
    ...actual,
  APP_SETTINGS_DEFAULT: {
    mirror_max_size: 0,
    mirror_video_bit_rate: 16_000_000,
    mirror_max_fps: 0,
    mirror_protocol: "usb",
    mirror_force_forward: false,
  },
  MIRROR_MIN_LAYOUT_PX: 64,
  errorText: (e: unknown) => String(e),
  mirrorStart: (...a: unknown[]) => mocks.mirrorStart(...a),
  mirrorStop: (...a: unknown[]) => mocks.mirrorStop(...a),
  mirrorInject: (...a: unknown[]) => mocks.mirrorInject(...a),
  mirrorCloseControl: (...a: unknown[]) => mocks.mirrorCloseControl(...a),
  mirrorLayout: (...a: unknown[]) => mocks.mirrorLayout(...a),
  mirrorPointer: (...a: unknown[]) => mocks.mirrorPointer(...a),
  mirrorScreenshot: (...a: unknown[]) => mocks.mirrorScreenshot(...a),
  deviceSetNightMode: (...a: unknown[]) => mocks.deviceSetNightMode(...a),
  settingsSet: (...a: unknown[]) => mocks.settingsSet(...a),
  dialogSaveFile: (...a: unknown[]) => mocks.dialogSaveFile(...a),
  onMirrorState: (h: (typeof mocks.stateHandlers)[0]) => {
    mocks.stateHandlers.push(h);
  },
  onMirrorPainted: (h: (typeof mocks.paintedHandlers)[0]) => {
    mocks.paintedHandlers.push(h);
  },
  onDeviceOffline: (h: (typeof mocks.offlineHandlers)[0]) => {
    mocks.offlineHandlers.push(h);
  },
  YoLog: { info: () => undefined, warn: () => undefined, error: () => undefined },
  };
});

describe("mirror store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.mirrorStart.mockReset();
    mocks.mirrorStop.mockReset();
    mocks.mirrorInject.mockReset();
    mocks.mirrorCloseControl.mockReset();
    mocks.mirrorLayout.mockReset();
    mocks.mirrorLayout.mockResolvedValue(undefined);
    mocks.mirrorPointer.mockReset();
    mocks.mirrorPointer.mockResolvedValue(undefined);
    mocks.mirrorScreenshot.mockReset();
    mocks.deviceSetNightMode.mockReset();
    mocks.settingsSet.mockReset();
    mocks.dialogSaveFile.mockReset();
    mocks.settingsSet.mockResolvedValue({
      mirror_max_size: 0,
      mirror_video_bit_rate: 16_000_000,
      mirror_max_fps: 0,
      mirror_protocol: "usb",
      mirror_force_forward: false,
    });
    mocks.stateHandlers.length = 0;
    mocks.paintedHandlers.length = 0;
    mocks.offlineHandlers.length = 0;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("无设备时 start 为空操作；绑定后 start 只传请求", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.start();
    expect(mocks.mirrorStart).not.toHaveBeenCalled();
    await store.bindSerial("S1");
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    expect(mocks.mirrorStart.mock.calls[0]?.[0]).toEqual({
      serial: "S1",
      control: true,
      connection: "usb",
      session_quality_touched: false,
    });
    expect(mocks.mirrorStart.mock.calls[0]?.length).toBe(1);
    const onState = mocks.stateHandlers.at(-1)!;
    onState({
      serial: "S1",
      generation: 1,
      state: "live",
      width: 1080,
      height: 1920,
      codec: "h265",
      control: false,
    });
    expect(store.state.phase).toBe("live");
    expect(store.state.width).toBe(1080);
    expect(store.state.hasFrame).toBe(false);
  }, 15000);

  it("Live 不等于已出画；mirror/painted 才置 hasFrame", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    expect(store.state.hasFrame).toBe(false);
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 1,
      state: "live",
      width: 1080,
      height: 1920,
      codec: "h265",
      control: false,
    });
    expect(store.state.hasFrame).toBe(false);
    mocks.paintedHandlers.at(-1)!({ serial: "S1", generation: 1, painted_fps: 42 });
    expect(store.state.hasFrame).toBe(true);
    expect(store.state.paintedFps).toBe(42);
  });

  it("掉线清空当前设备画面状态，保留编码尺寸", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 2,
      state: "live",
      width: 1080,
      height: 1920,
      codec: "h264",
      control: true,
    });
    mocks.offlineHandlers.at(-1)!({ serial: "S1" });
    expect(store.state.phase).toBe("idle");
    expect(store.state.error).toBe("设备掉线: S1");
    expect(store.state.width).toBe(1080);
    expect(store.state.height).toBe(1920);
  });

  it("applySettings 不进入 start 负载；persistQuality 后 session_quality_touched 为 true", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    store.applySettings({
      mirror_max_size: 0,
      mirror_video_bit_rate: 16_000_000,
      mirror_max_fps: 0,
      mirror_protocol: "usb",
    });
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    expect(mocks.mirrorStart.mock.calls[0]?.[0]).toEqual({
      serial: "S1",
      control: true,
      connection: "usb",
      session_quality_touched: false,
    });
    await store.persistQuality("mirror_max_size", 1280);
    await store.start();
    expect(mocks.mirrorStart.mock.calls[1]?.[0]).toEqual({
      serial: "S1",
      control: true,
      connection: "usb",
      session_quality_touched: true,
    });
  });

  it("persistQuality 失败不立旗并上抛", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.settingsSet.mockRejectedValueOnce(new Error("write fail"));
    await expect(store.persistQuality("mirror_max_size", 1280)).rejects.toThrow("write fail");
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    expect(mocks.mirrorStart.mock.calls[0]?.[0]).toEqual({
      serial: "S1",
      control: true,
      connection: "usb",
      session_quality_touched: false,
    });
  });

  it("tcp 连接自动 wifi 档并默认 forward", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    store.bindConnection("tcp:192.168.1.8:5555");
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    expect(mocks.mirrorStart.mock.calls[0]?.[0]).toEqual({
      serial: "S1",
      control: true,
      connection: "tcp:192.168.1.8:5555",
      session_quality_touched: false,
    });
  });

  it("adopt 不再 stop+restart", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 3, adopted: true });
    await store.start();
    expect(mocks.mirrorStop).not.toHaveBeenCalled();
    expect(mocks.mirrorStart).toHaveBeenCalledTimes(1);
  });

  it("会话进行中 bindSerial(null) 显式 stop 并解绑", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 1,
      state: "live",
      width: 1080,
      height: 1920,
      codec: "h265",
      control: false,
    });
    mocks.mirrorStop.mockResolvedValue(undefined);
    await store.bindSerial(null);
    expect(mocks.mirrorStop).toHaveBeenCalledWith("S1");
    expect(store.state.serial).toBeNull();
    expect(store.state.phase).toBe("idle");
  });

  it("saveScreenshot 走 dialog 再 mirror.screenshot", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.dialogSaveFile.mockResolvedValue({ ok: true, path: "/x/mirror.png" });
    mocks.mirrorScreenshot.mockResolvedValue(undefined);
    await store.saveScreenshot();
    expect(mocks.dialogSaveFile).toHaveBeenCalledWith({
      title: "保存截图",
      defaultPath: "mirror.png",
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    expect(mocks.mirrorScreenshot).toHaveBeenCalledWith({
      serial: "S1",
      path: "/x/mirror.png",
    });
  });

    it("saveScreenshot 取消时不写盘", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.dialogSaveFile.mockResolvedValue({ ok: false, reason: "cancelled" });
    await store.saveScreenshot();
    expect(mocks.mirrorScreenshot).not.toHaveBeenCalled();
  });

  it("仅显示启动不打开控制通道", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    await store.setReadOnly(true);
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    expect(mocks.mirrorStart.mock.calls[0]?.[0]).toEqual({
      serial: "S1",
      control: false,
      connection: "usb",
      session_quality_touched: false,
    });
  });

  it("Live 只读只 closeControl，失败不上重启", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    await store.setReadOnly(false);
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    await store.start();
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 1,
      state: "live",
      width: 1080,
      height: 1920,
      codec: "h265",
      control: true,
    });
    mocks.mirrorCloseControl.mockRejectedValueOnce(new Error("NotLive"));
    await expect(store.setReadOnly(true)).rejects.toThrow("NotLive");
    expect(mocks.mirrorStop).not.toHaveBeenCalled();
    expect(store.state.readOnly).toBe(false);
  });

  it("idle 仍上报 layout：View 只交 avail，store 组装旗标", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    store.reportAvail({
      x: 10,
      y: 20,
      width: 300,
      height: 600,
      visible: true,
      dpr: 1,
      dark: false,
    });
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).toMatchObject({
      serial: "S1",
      visible: true,
      dpr: 1,
      fullscreen: false,
      paused: false,
      control: false,
      has_device: true,
      failed: false,
      error: "",
      dark: false,
    });
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).not.toHaveProperty("epoch");
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).not.toHaveProperty("video_width");
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).not.toHaveProperty("mode");
  });

  it("layout 只抄占用字段，不含编码尺寸", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    store.setFullscreen(true);
    store.setPaused(true);
    store.reportAvail({
      x: 10,
      y: 20,
      width: 300,
      height: 600,
      visible: true,
      dpr: 1.5,
      dark: true,
    });
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).toMatchObject({
      serial: "S1",
      dpr: 1.5,
      fullscreen: true,
      paused: true,
      control: false,
      has_device: true,
      failed: false,
      dark: true,
    });
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).not.toHaveProperty("video_width");
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).not.toHaveProperty("video_height");
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).not.toHaveProperty("stroke_px");
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).not.toHaveProperty("corner_radius");
  });

  it("同 avail 不重复 invoke；暂停只由 store 重组装", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    const avail = {
      x: 10,
      y: 20,
      width: 300,
      height: 600,
      visible: true,
      dpr: 1,
      dark: false,
    };
    store.reportAvail(avail);
    store.reportAvail(avail);
    expect(mocks.mirrorLayout).toHaveBeenCalledTimes(1);
    mocks.mirrorLayout.mockClear();
    store.setPaused(true);
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).toMatchObject({
      serial: "S1",
      paused: true,
      width: 300,
      height: 600,
    });
  });

  it("同 avail 去重，不因再入座重报", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    const avail = {
      x: 10,
      y: 20,
      width: 300,
      height: 600,
      visible: true,
      dpr: 1,
      dark: false,
    };
    store.reportAvail(avail);
    store.reportAvail(avail);
    expect(mocks.mirrorLayout).toHaveBeenCalledTimes(1);
  });

  it("离开可用区上报隐藏，再入座同 avail 仍上报", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    const avail = {
      x: 10,
      y: 20,
      width: 300,
      height: 600,
      visible: true,
      dpr: 1,
      dark: false,
    };
    store.reportAvail(avail);
    store.leaveAvail();
    expect(mocks.mirrorLayout.mock.calls[1]?.[0]).toMatchObject({
      serial: "S1",
      visible: false,
      width: 300,
      height: 600,
    });
    mocks.mirrorLayout.mockClear();
    store.reportAvail(avail);
    expect(mocks.mirrorLayout).toHaveBeenCalledTimes(1);
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).toMatchObject({
      visible: true,
      width: 300,
      height: 600,
    });
  });

  it("可见且小于最小像素不上报；隐藏仍上报", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    store.reportAvail({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      visible: true,
      dpr: 1,
      dark: false,
    });
    expect(mocks.mirrorLayout).not.toHaveBeenCalled();
    store.reportAvail({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      visible: false,
      dpr: 1,
      dark: false,
    });
    expect(mocks.mirrorLayout.mock.calls[0]?.[0]).toMatchObject({
      serial: "S1",
      visible: false,
      width: 10,
      height: 10,
    });
  });

  it("setDeviceNight 先乐观再 IPC；失败回到 hub", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    store.bindNight(false);
    expect(store.state.night).toBe(false);
    mocks.deviceSetNightMode.mockResolvedValue({ serial: "S1", night: true });
    const pending = store.setDeviceNight("S1", true);
    expect(store.state.night).toBe(true);
    await pending;
    expect(mocks.deviceSetNightMode).toHaveBeenCalledWith("S1", true);
    store.bindNight(true);
    expect(store.state.nightPending).toBeNull();
    expect(store.state.night).toBe(true);
    mocks.deviceSetNightMode.mockRejectedValueOnce(new Error("fail"));
    await expect(store.setDeviceNight("S1", false)).rejects.toThrow("fail");
    expect(store.state.night).toBe(true);
  });

  it("停止保留编码尺寸", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.mirrorStart.mockResolvedValue({ serial: "S1", generation: 1, adopted: false });
    mocks.mirrorStop.mockResolvedValue(undefined);
    await store.start();
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 1,
      state: "live",
      width: 1080,
      height: 1920,
      codec: "h265",
      control: true,
    });
    await store.stop();
    expect(store.state.phase).toBe("idle");
    expect(store.state.hasFrame).toBe(false);
    expect(store.state.width).toBe(1080);
    expect(store.state.height).toBe(1920);
  });

  it("bindSerial 与 stopped 事件不得把宽高清零", async () => {
    const { createMirrorStore } = await import("./store");
    const store = createMirrorStore();
    await store.bindSerial("S1");
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 1,
      state: "live",
      width: 1088,
      height: 2400,
      codec: "h265",
      control: true,
    });
    mocks.stateHandlers.at(-1)!({
      serial: "S1",
      generation: 1,
      state: "stopped",
      width: 0,
      height: 0,
      codec: "",
      control: false,
    });
    expect(store.state.width).toBe(1088);
    expect(store.state.height).toBe(2400);
    await store.bindSerial("S2");
    expect(store.state.serial).toBe("S2");
    expect(store.state.phase).toBe("idle");
    expect(store.state.width).toBe(1088);
    expect(store.state.height).toBe(2400);
  });
});

describe("画面收起、绑定事件和质量投影只写一次", () => {
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");

  it("暂停和全屏的收起值只留在所有者里", () => {
    expect(source.match(/paused: false/g)).toHaveLength(1);
    expect(source.match(/fullscreen: false/g)).toHaveLength(1);
    expect(source).toContain("clearedPlayback");
    expect(source).not.toContain("APP_SETTINGS_DEFAULT.mirror_");
    expect(source).toContain("settingsSlice(APP_SETTINGS_DEFAULT)");
    expect(source).not.toContain("e.serial !== state.serial");
    expect(source).toContain("eventForBound");
  });
});

describe("没有绑定就返回，否则独占执行", () => {
  it("exclusive_when_bound_once", () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
    const needle = "if (!serial) " + "return;";
    expect(source.split(needle).length - 1).toBe(1);
    expect(source).toContain("exclusiveWhenBound(");
  });
});

describe("播放旗标没变就返回，否则写入并刷新布局", () => {
  it("commit_playback_flag_once", () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
    const pausedNeedle = "paused === " + "state.paused";
    const fullscreenNeedle = "fullscreen === " + "state.fullscreen";
    const ownerNeedle = "value === state[key]";
    expect(source.split(pausedNeedle).length - 1).toBe(0);
    expect(source.split(fullscreenNeedle).length - 1).toBe(0);
    expect(source.split(ownerNeedle).length - 1).toBe(1);
    expect(source).toContain("commitPlaybackFlag(");
  });
});

describe("布局旗标里的空字符串只写一次", () => {
  it("flag_text_once", () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
    const needle = "?? " + "\"\"";
    expect(source.split(needle).length - 1).toBe(1);
    expect(source).toContain("flagText(state.serial)");
    expect(source).toContain("flagText(state.error)");
    expect(source).toContain("Boolean(state.serial)");
    expect(source).toContain("e.error ?? null");
  });
});

function times(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

function storeSource(): string {
  return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
}

describe("阶段空闲", () => {
  it("解绑、停止和掉线都写成空闲，字面只留在函数体", () => {
    const source = storeSource();
    expect(times(source, "phase: " + "\"idle\"")).toBe(1);
    expect(times(source, "function phaseIdle")).toBe(1);
    expect(times(source, "export function phaseIdle")).toBe(0);
    expect(times(source, "phaseIdle()")).toBe(4);
    expect(times(source, "phase: " + "\"starting\"")).toBe(1);
    expect(times(source, "phase: " + "\"failed\"")).toBe(1);
  });
});

describe("错误收成空", () => {
  it("解绑、开始和停止都清错误，掉线句不并", () => {
    const source = storeSource();
    expect(times(source, "error: " + "null")).toBe(1);
    expect(times(source, "function clearedError")).toBe(1);
    expect(times(source, "export function clearedError")).toBe(0);
    expect(times(source, "clearedError()")).toBe(4);
    expect(source).toContain("deviceOfflineText(e.serial)");
    expect(source).toContain("e.error ?? null");
  });
});

describe("控制通道关掉", () => {
  it("解绑、只读和掉线都关掉控制，停止不写", () => {
    const source = storeSource();
    expect(times(source, "control: " + "false")).toBe(1);
    expect(times(source, "function controlOff")).toBe(1);
    expect(times(source, "export function controlOff")).toBe(0);
    expect(times(source, "controlOff()")).toBe(4);
  });
});

describe("没有画面", () => {
  it("收起、开始和失败都清已出画，失败不并实测帧率", () => {
    const source = storeSource();
    expect(times(source, "hasFrame: " + "false")).toBe(1);
    expect(times(source, "function frameOff")).toBe(1);
    expect(times(source, "export function frameOff")).toBe(0);
    expect(times(source, "frameOff()")).toBe(4);
    expect(times(source, "paused: " + "false")).toBe(1);
    expect(times(source, "fullscreen: " + "false")).toBe(1);
  });
});

describe("实测帧率归零", () => {
  it("收起和开始都归零，失败路径不写", () => {
    const source = storeSource();
    expect(times(source, "paintedFps: " + "0")).toBe(1);
    expect(times(source, "function fpsOff")).toBe(1);
    expect(times(source, "export function fpsOff")).toBe(0);
    expect(times(source, "fpsOff()")).toBe(3);
  });
});

describe("画面边已给出", () => {
  it("宽和高都问是否大于 0，世代不并", () => {
    const source = storeSource();
    expect(times(source, "e.width > " + "0")).toBe(0);
    expect(times(source, "e.height > " + "0")).toBe(0);
    expect(times(source, "px > " + "0")).toBe(1);
    expect(times(source, "function edgeOpen")).toBe(1);
    expect(times(source, "export function edgeOpen")).toBe(0);
    expect(times(source, "edgeOpen(e.width)")).toBe(1);
    expect(times(source, "edgeOpen(e.height)")).toBe(1);
  });
});

describe("投屏信息日志", () => {
  it("信息日志都走同一频道，失败仍走 error", () => {
    const source = storeSource();
    expect(times(source, "YoLog.info(" + "\"mirror\"")).toBe(1);
    expect(times(source, "function mirrorInfo")).toBe(1);
    expect(times(source, "export function mirrorInfo")).toBe(0);
    expect(times(source, "mirrorInfo(" + "\"")).toBe(7);
    expect(times(source, "YoLog.error(" + "\"mirror\"")).toBe(1);
  });
});

describe("当前只读", () => {
  it("只读只读一次，开始、注入和指针各判各的", () => {
    const source = storeSource();
    expect(times(source, "state." + "readOnly")).toBe(1);
    expect(times(source, "!state." + "readOnly")).toBe(0);
    expect(times(source, "function readOnlyNow")).toBe(1);
    expect(times(source, "export function readOnlyNow")).toBe(0);
    expect(times(source, "readOnlyNow()")).toBe(5);
    expect(times(source, "function startWantsControl")).toBe(1);
    expect(times(source, "export function startWantsControl")).toBe(0);
    expect(times(source, "startWantsControl()")).toBe(3);
    expect(times(source, "!readOnlyNow()")).toBe(1);
    expect(times(source, "|| readOnlyNow() || " + "!state.control")).toBe(1);
  });
});

describe("当前阶段", () => {
  it("阶段只读一次，失败、在播和正在启动不并", () => {
    const source = storeSource();
    expect(times(source, "state." + "phase")).toBe(1);
    expect(times(source, "function sessionPhase")).toBe(1);
    expect(times(source, "export function sessionPhase")).toBe(0);
    expect(times(source, "sessionPhase()")).toBe(4);
    expect(source).toContain("mirrorIsFailed(sessionPhase())");
    expect(source).toContain("mirrorIsLive(sessionPhase())");
    expect(source).toContain("mirrorIsStarting(sessionPhase())");
  });
});

describe("这次开始的连接", () => {
  it("日志和开始请求都读当前连接，两个键名不并", () => {
    const source = storeSource();
    expect(times(source, "state." + "connection")).toBe(1);
    expect(times(source, "function sessionConnection")).toBe(1);
    expect(times(source, "export function sessionConnection")).toBe(0);
    expect(times(source, "sessionConnection()")).toBe(3);
    expect(source).toContain("sessionQualityTouched");
    expect(source).toContain("session_quality_touched");
  });
});

describe("只处理当前绑定", () => {
  it("状态、出画和掉线都先问绑定，出画世代不并", () => {
    const source = storeSource();
    expect(times(source, "if (!eventForBound(e.serial)) " + "return;")).toBe(1);
    expect(times(source, "function onBound")).toBe(1);
    expect(times(source, "export function onBound")).toBe(0);
    expect(times(source, "onBound(")).toBe(3);
    expect(source).toContain("e.generation !== state.generation");
  });
});

describe("夜览等待收起", () => {
  it("解绑和乐观失败都清掉等待，夜览值本身不并", () => {
    const source = storeSource();
    expect(times(source, "nightPending: " + "null")).toBe(1);
    expect(times(source, "function pendingOff")).toBe(1);
    expect(times(source, "export function pendingOff")).toBe(0);
    expect(times(source, "pendingOff()")).toBe(3);
    expect(times(source, "night: " + "hub")).toBe(1);
  });
});

describe("初始会话就是解绑之后", () => {
  it("世代和夜览三态只写在解绑结果里", () => {
    const source = storeSource();
    expect(times(source, "generation: " + "0")).toBe(1);
    expect(times(source, "nightHub: " + "null")).toBe(1);
    expect(times(source, "nightPending: " + "null")).toBe(1);
    expect(times(source, "night: " + "null")).toBe(1);
    expect(times(source, "function idleAfterUnbind")).toBe(1);
    expect(times(source, "export function idleAfterUnbind")).toBe(0);
    expect(times(source, "idleAfterUnbind()")).toBe(3);
  });
});
