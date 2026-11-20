/**
 * 日志 store 测试：窗口生命周期 + 每设备引用计数 + 批量事件管线。
 * @yohu/api 全量 mock；订阅返回 unlisten；测试取最后一个（当前实例）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LogHits, LogLine, LogPage, LogWindowBind } from "@yohu/api";

const mocks = vi.hoisted(() => ({
  logCaptureStart: vi.fn(),
  logCaptureStop: vi.fn(),
  logCaptureStatus: vi.fn(),
  logClearDevice: vi.fn(),
  logWindowBind: vi.fn(),
  logRange: vi.fn(),
  logWindowRelease: vi.fn(),
  logExport: vi.fn(),
  logProcessSnapshot: vi.fn(),
  logPackageSnapshot: vi.fn(),
  logHitsHandlers: [] as ((e: LogHits) => void)[],
  logOverflowHandlers: [] as ((e: { serial: string }) => void)[],
  processIndexHandlers: [] as ((e: unknown) => void)[],
  captureStateHandlers: [] as ((e: { serial: string; generation: number; state: string }) => void)[],
  deviceOfflineHandlers: [] as ((e: { serial: string }) => void)[],
  devicesChangedHandlers: [] as ((e: { devices: unknown[] }) => void)[],
  settingsChangedHandlers: [] as ((e: { key: string; settings: { buffer_capacity: number } }) => void)[],
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  const noop = (): void => undefined;
  const notConfigured = vi.fn(async () => {
    throw new Error("测试未配置该命令 mock");
  });
  return {
    ...actual,
    APP_SETTINGS_DEFAULT: { buffer_capacity: 10_000 },
    deviceRefresh: notConfigured,
    deviceList: notConfigured,
    systemInfo: notConfigured,
    settingsSet: notConfigured,
    systemReportError: noop,
    YoLog: { info: noop, warn: noop, error: noop },
    systemOpenPath: notConfigured,
    adbExec: notConfigured,
    terminalEval: notConfigured,
    groupRun: notConfigured,
    groupCancel: notConfigured,
    commandlibLoad: notConfigured,
    commandlibSave: notConfigured,
    filesList: notConfigured,
    filesSessionAttach: notConfigured,
    filesSessionDetach: notConfigured,
    filesPush: notConfigured,
    filesPull: notConfigured,
    filesCancel: notConfigured,
    filesDelete: notConfigured,
    filesMkdir: notConfigured,
    filesDragOut: notConfigured,
    logCaptureStart: (...a: unknown[]) => mocks.logCaptureStart(...a),
    logCaptureStop: (...a: unknown[]) => mocks.logCaptureStop(...a),
    logCaptureStatus: (...a: unknown[]) => mocks.logCaptureStatus(...a),
    logClearDevice: (...a: unknown[]) => mocks.logClearDevice(...a),
    logWindowBind: (...a: unknown[]) => mocks.logWindowBind(...a),
    logRange: (...a: unknown[]) => mocks.logRange(...a),
    logWindowRelease: (...a: unknown[]) => mocks.logWindowRelease(...a),
    logExport: (...a: unknown[]) => mocks.logExport(...a),
    logProcessSnapshot: (...a: unknown[]) => mocks.logProcessSnapshot(...a),
    logPackageSnapshot: (...a: unknown[]) => mocks.logPackageSnapshot(...a),
    onDevicesChanged: (h: (e: { devices: unknown[] }) => void): Promise<() => void> => {
      mocks.devicesChangedHandlers.push(h);
      return Promise.resolve(() => {
        const i = mocks.devicesChangedHandlers.indexOf(h);
        if (i >= 0) mocks.devicesChangedHandlers.splice(i, 1);
      });
    },
    onDeviceOffline: (h: (e: { serial: string }) => void): Promise<() => void> => {
      mocks.deviceOfflineHandlers.push(h);
      return Promise.resolve(() => {
        const i = mocks.deviceOfflineHandlers.indexOf(h);
        if (i >= 0) mocks.deviceOfflineHandlers.splice(i, 1);
      });
    },
    onLogHits: (h: (e: LogHits) => void): Promise<() => void> => {
      mocks.logHitsHandlers.push(h);
      return Promise.resolve(() => {
        const i = mocks.logHitsHandlers.indexOf(h);
        if (i >= 0) mocks.logHitsHandlers.splice(i, 1);
      });
    },
    onLogOverflow: (h: (e: { serial: string }) => void): Promise<() => void> => {
      mocks.logOverflowHandlers.push(h);
      return Promise.resolve(() => {
        const i = mocks.logOverflowHandlers.indexOf(h);
        if (i >= 0) mocks.logOverflowHandlers.splice(i, 1);
      });
    },
    onProcessIndex: (h: (e: unknown) => void): Promise<() => void> => {
      mocks.processIndexHandlers.push(h);
      return Promise.resolve(() => {
        const i = mocks.processIndexHandlers.indexOf(h);
        if (i >= 0) mocks.processIndexHandlers.splice(i, 1);
      });
    },
    onCaptureState: (h: (e: { serial: string; generation: number; state: string }) => void): Promise<() => void> => {
      mocks.captureStateHandlers.push(h);
      return Promise.resolve(() => {
        const i = mocks.captureStateHandlers.indexOf(h);
        if (i >= 0) mocks.captureStateHandlers.splice(i, 1);
      });
    },
    onTransferProgress: noop,
    onNativeDragDrop: (): Promise<() => void> => Promise.resolve(() => undefined),
    onGroupProgress: noop,
    onTaskSummary: noop,
    onSettingsChanged: (h: (e: { key: string; settings: { buffer_capacity: number } }) => void): Promise<() => void> => {
      mocks.settingsChangedHandlers.push(h);
      return Promise.resolve(() => {
        const i = mocks.settingsChangedHandlers.indexOf(h);
        if (i >= 0) mocks.settingsChangedHandlers.splice(i, 1);
      });
    },
    EVENT_NAMES: {
      devicesChanged: "devices/changed",
      deviceOffline: "device/offline",
      logHits: "log/hits",
      logOverflow: "log/overflow",
      processIndex: "log/processIndex",
      captureState: "log/captureState",
      transferProgress: "transfer/progress",
      groupProgress: "group/progress",
      taskSummary: "task/summary",
      settingsChanged: "settings/changed",
    },
  };
});

import { matchesWireFilter, pidSetOf } from "@yohu/api";
import { createLogStore, SYSTEM_SESSION_TITLE } from "./store";
import { sessionWire, toSessionFilter } from "./filter";
import type { LogStoreApi } from "./store";

const liveStores: LogStoreApi[] = [];

const mk = (seq: number, over: Partial<LogLine> = {}): LogLine => ({
  seq,
  ts: "2026-01-01 00:00:00.000",
  pid: 100,
  tid: 1,
  level: "I",
  tag: "T",
  msg: "m",
  ...over,
});

const rings = new Map<string, LogLine[]>();

function ringSize(serial: string): number {
  return rings.get(serial)?.length ?? 0;
}

function remember(serial: string, lines: LogLine[], cap: number): void {
  const next = [...(rings.get(serial) ?? []), ...lines];
  rings.set(serial, next.length > cap ? next.slice(next.length - cap) : next);
}

function pageFor(spec: LogWindowBind): LogPage {
  const rows = (rings.get(spec.serial) ?? []).filter(
    (line) => line.seq >= spec.from_seq && matchesWireFilter(line, spec.filter),
  );
  return {
    window_id: spec.id,
    serial: spec.serial,
    total: rows.length,
    lines: rows,
  };
}

function track(store: LogStoreApi): LogStoreApi {
  liveStores.push(store);
  return store;
}

function wiredStore(): LogStoreApi {
  const store = track(createLogStore());
  void store.bindSerial("S1");
  store.ensureSession();
  return store;
}

function anyCapturing(store: LogStoreApi): boolean {
  return store.state.sessions.some((s) => s.capturing);
}

function generationOf(store: LogStoreApi, serial?: string | null): number {
  return store.state.devices[serial ?? store.state.serial ?? ""]?.generation ?? 0;
}

function overflowedOf(store: LogStoreApi, serial?: string | null): boolean {
  return store.state.devices[serial ?? store.state.serial ?? ""]?.overflowed === true;
}

async function liveStore(): Promise<LogStoreApi> {
  const store = wiredStore();
  await store.startCapture();
  return store;
}

const push = (serial: string, lines: LogLine[]): void => {
  const store = liveStores.at(-1);
  remember(serial, lines, store?.state.bufferCapacity ?? 10_000);
  if (!store || lines.length === 0) return;
  const last = lines[lines.length - 1]!.seq;
  for (const session of store.state.sessions) {
    if (session.serial !== serial || !session.capturing) continue;
    const wire = sessionWire(toSessionFilter(session));
    const indexed = (rings.get(serial) ?? []).filter(
      (line) => line.seq >= Math.max(0, session.fromSeq) && matchesWireFilter(line, wire),
    );
    mocks.logHitsHandlers.at(-1)?.({
      serial,
      window_id: session.id,
      total: indexed.length,
      appended: indexed.length,
      last_seq: last,
    });
  }
};

afterEach(() => {
  for (const store of liveStores) store.dispose();
  liveStores.length = 0;
  rings.clear();
});

beforeEach(() => {
  mocks.logCaptureStart.mockReset();
  mocks.logCaptureStop.mockReset();
  mocks.logCaptureStatus.mockReset();
  mocks.logWindowBind.mockReset();
  mocks.logRange.mockReset();
  mocks.logWindowRelease.mockReset();
  mocks.logExport.mockReset();
  mocks.logProcessSnapshot.mockReset();
  mocks.logPackageSnapshot.mockReset();
  mocks.logWindowBind.mockImplementation(async (spec: LogWindowBind) => pageFor(spec));
  // UI 实时从环拉取：mock 直接按 from_seq 返回环中剩余原始行（同步数组，便于用例断言）
  mocks.logRange.mockImplementation(
    (req: { serial: string; from_seq: number; limit: number }) =>
      (rings.get(req.serial) ?? []).filter((line) => line.seq >= req.from_seq).slice(0, req.limit),
  );
  mocks.logWindowRelease.mockResolvedValue(undefined);
  mocks.logExport.mockResolvedValue({ path: "x.txt", lines: 0 });
  mocks.logProcessSnapshot.mockResolvedValue([]);
  mocks.logPackageSnapshot.mockResolvedValue([]);
  mocks.logCaptureStart.mockImplementation(async (serial: unknown) => {
    rings.delete(String(serial));
    return {
      serial,
      generation: 1,
      adopted: false,
    };
  });
  mocks.logCaptureStop.mockResolvedValue(undefined);
  mocks.logCaptureStatus.mockImplementation(async (serial: unknown) => ({
    serial,
    capturing: true,
    generation: 0,
  }));
});

describe("logStore 窗口生命周期", () => {
  it("ensureSession 创建默认 System 窗口并激活", () => {
    const store = wiredStore();
    expect(store.state.sessions).toHaveLength(1);
    expect(store.state.sessions[0]!.title).toBe(SYSTEM_SESSION_TITLE);
    expect(store.state.sessions[0]!.scope).toEqual({ kind: "all" });
    expect(store.state.sessions[0]!.serial).toBe("S1");
    expect(store.state.sessions[0]!.capturing).toBe(false);
    expect(store.state.sessions[0]!.fromSeq).toBeLessThan(0);
    expect(store.state.activeSessionId).toBe(store.state.sessions[0]!.id);
  });

  it("新建窗口空且停，不重放镜像", async () => {
    const store = await liveStore();
    push("S1", [mk(0), mk(1)]);
    expect(store.state.sessions[0]!.visible).toHaveLength(2);
    const id = store.createSession({ kind: "all" }, "A");
    const created = store.state.sessions.find((s) => s.id === id)!;
    expect(created.capturing).toBe(false);
    expect(created.visible).toHaveLength(0);
    expect(created.fromSeq).toBeLessThan(0);
    expect(ringSize("S1")).toBe(2);
  });

  it("renameSession：修剪标题、拒绝空标题", () => {
    const store = wiredStore();
    const id = store.state.sessions[0]!.id;
    store.renameSession(id, "  主会话  ");
    expect(store.state.sessions[0]!.title).toBe("主会话");
    store.renameSession(id, "   ");
    expect(store.state.sessions[0]!.title).toBe("主会话");
  });

  it("duplicateSession：拷贝 scope/过滤，副本空且停", () => {
    const store = wiredStore();
    const src = store.createSession({ kind: "pid", pid: 42 }, "PID 42");
    store.patchFilter(src, { levels: ["W"], keyword: "x" });
    const copy = store.duplicateSession(src);
    expect(copy).not.toBeNull();
    const dup = store.state.sessions.find((s) => s.id === copy);
    expect(dup?.scope).toEqual({ kind: "pid", pid: 42 });
    expect(dup?.levels).toEqual(["W"]);
    expect(dup?.keyword).toBe("x");
    expect(dup?.title).toContain("副本");
    expect(dup?.capturing).toBe(false);
    expect(dup?.visible).toHaveLength(0);
    expect(store.state.activeSessionId).toBe(copy);
  });

  it("closeOthers：仅保留目标并激活", () => {
    const store = wiredStore();
    const a = store.createSession({ kind: "all" }, "A");
    store.createSession({ kind: "all" }, "B");
    store.closeOthers(a);
    expect(store.state.sessions.map((s) => s.id)).toEqual([a]);
    expect(store.state.activeSessionId).toBe(a);
  });

  it("closeSession：关闭最后一个时重建默认 System", () => {
    const store = wiredStore();
    const id = store.state.sessions[0]!.id;
    store.closeSession(id);
    expect(store.state.sessions).toHaveLength(1);
    expect(store.state.sessions[0]!.title).toBe(SYSTEM_SESSION_TITLE);
    expect(store.state.sessions[0]!.scope).toEqual({ kind: "all" });
  });
});

describe("logStore 批量事件管线（消费端过滤，ADR-v6-006）", () => {
  it("级别精确筛选 + 堆叠折叠 + 信号计数 + 镜像行数", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    store.patchFilter(id, { levels: ["E"] });
    push("S1", [
      mk(0, { level: "I", msg: "info" }),
      mk(1, { level: "E", msg: "error one" }),
      mk(2, { level: "E", msg: "at a()" }),
      mk(3, { level: "E", msg: "at b()" }),
      mk(4, { level: "E", tag: "AndroidRuntime", msg: "FATAL EXCEPTION: main" }),
    ]);
    const session = store.state.sessions[0]!;
    expect(session.visible.map((r) => r.line.seq)).toEqual([1, 2, 4]);
    expect(session.visible[1]!.collapsedAfter).toBe(1);
    expect(session.visible[2]!.signal).toBe("crash");
    expect(session.signalCount).toBe(1);
    expect(ringSize("S1")).toBe(5);
  });

  it("选 W 只留 W，不带出 E/F", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    store.patchFilter(id, { levels: ["W"] });
    push("S1", [
      mk(0, { level: "I", msg: "info" }),
      mk(1, { level: "W", msg: "warn" }),
      mk(2, { level: "E", msg: "err" }),
      mk(3, { level: "F", msg: "fatal" }),
    ]);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["warn"]);
  });

  it("信号计数跟可见面板；采集订阅不因信号变红/停", async () => {
    const store = await liveStore();
    store.setBufferCapacity(2);
    push("S1", [
      mk(0, { level: "E", tag: "AndroidRuntime", msg: "FATAL EXCEPTION: main" }),
      mk(1, { msg: "recovered" }),
      mk(2, { msg: "still live" }),
    ]);
    const session = store.state.sessions[0]!;
    expect(session.visible.map((r) => r.line.seq)).toEqual([1, 2]);
    expect(session.signalCount).toBe(0);
    expect(session.capturing).toBe(true);
  });

  it("关键字/Tag 过滤与信号行标记", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    store.patchFilter(id, { keyword: "hello", tagContains: "app" });
    push("S1", [
      mk(0, { tag: "app", msg: "Hello World" }),
      mk(1, { tag: "app", msg: "bye" }),
      mk(2, { tag: "other", msg: "Hello again" }),
      mk(3, { msg: "ANR in com.foo" }),
    ]);
    const session = store.state.sessions[0]!;
    expect(session.visible.map((r) => r.line.seq)).toEqual([0]);
    expect(session.visible[0]!.signal).toBeUndefined();
    expect(ringSize("S1")).toBe(4);
  });

  it("清除检索从镜像补回中间被筛掉的行", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [
      mk(0, { msg: "alpha" }),
      mk(1, { msg: "beta hello" }),
      mk(2, { msg: "gamma" }),
    ]);
    await store.patchFilter(id, { keyword: "hello" });
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["beta hello"]);
    await store.patchFilter(id, { keyword: "" });
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["alpha", "beta hello", "gamma"]);
  });

  it("离开底部后清除检索装入全部命中，未跟滚的 pending 保留", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [
      mk(0, { msg: "alpha" }),
      mk(1, { msg: "beta hello" }),
      mk(2, { msg: "gamma" }),
    ]);
    store.detachFollow(id);
    await store.patchFilter(id, { keyword: "hello" });
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["beta hello"]);
    expect(store.state.sessions[0]!.frozenThroughSeq).toBe(2);
    push("S1", [mk(3, { msg: "hello tail" })]);
    expect(store.state.sessions[0]!.pendingCount).toBe(1);
    await store.patchFilter(id, { keyword: "" });
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual([
      "alpha",
      "beta hello",
      "gamma",
      "hello tail",
    ]);
    expect(store.state.sessions[0]!.pendingCount).toBe(1);
    expect(store.state.sessions[0]!.following).toBe(false);
  });

  it("空面板不能离开底部：detach 空操作，入镜仍跟滚", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    expect(store.state.sessions[0]!.fromSeq).toBe(0);
    store.detachFollow(id);
    expect(store.state.sessions[0]!.following).toBe(true);
    expect(store.state.sessions[0]!.frozenThroughSeq).toBeNull();
    push("S1", [mk(0), mk(1)]);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0, 1]);
    expect(store.state.sessions[0]!.pendingCount).toBe(0);
    expect(store.state.sessions[0]!.following).toBe(true);
  });

  it("新流 flush 后强制跟滚：停跟滚再开采集，快照进可见区而不是 pending", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [mk(0), mk(1)]);
    store.detachFollow(id);
    expect(store.state.sessions[0]!.following).toBe(false);
    await store.stopCapture();
    mocks.logCaptureStart.mockResolvedValueOnce({ serial: "S1", generation: 3, adopted: false });
    mocks.logWindowBind.mockResolvedValueOnce({
      window_id: id,
      serial: "S1",
      total: 3,
      lines: [mk(0), mk(1), mk(2)],
    });
    await store.startCapture();
    expect(store.state.sessions[0]!.id).toBe(id);
    expect(store.state.sessions[0]!.following).toBe(true);
    expect(store.state.sessions[0]!.frozenThroughSeq).toBeNull();
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2]);
    expect(store.state.sessions[0]!.pendingCount).toBe(0);
  });

  it("清除级别过滤从镜像补回被筛掉的行", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [mk(0, { level: "I", msg: "info" }), mk(1, { level: "E", msg: "err" })]);
    await store.patchFilter(id, { levels: ["E"] });
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["err"]);
    await store.patchFilter(id, { levels: [] });
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["info", "err"]);
  });

  it("其他设备批次入该机镜像，不进入本窗口", async () => {
    const store = await liveStore();
    push("OTHER", [mk(0)]);
    expect(ringSize("S1")).toBe(0);
    expect(ringSize("OTHER")).toBe(1);
    expect(store.state.sessions[0]!.visible).toHaveLength(0);
  });

  it("离开底部只计数不跟滚；resumeFollow 按 seq 补齐可见区", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [mk(0), mk(1)]);
    expect(store.state.sessions[0]!.visible).toHaveLength(2);
    store.detachFollow(id);
    expect(store.state.sessions[0]!.following).toBe(false);
    push("S1", [mk(2), mk(3)]);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3]);
    expect(store.state.sessions[0]!.pendingCount).toBe(2);
    expect(store.state.sessions[0]!.following).toBe(false);
    expect(ringSize("S1")).toBe(4);
    await store.resumeFollow(id);
    expect(store.state.sessions[0]!.following).toBe(true);
    expect(store.state.sessions[0]!.frozenThroughSeq).toBeNull();
    expect(store.state.sessions[0]!.pendingCount).toBe(0);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3]);
  });

  it("resumeFollow 在镜像被清空时不冲掉已有可见区", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [mk(0), mk(1)]);
    store.detachFollow(id);
    rings.delete("S1");
    await store.resumeFollow(id);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0, 1]);
    expect(store.state.sessions[0]!.following).toBe(true);
  });

  it("buffer_capacity 裁剪时镜像为空不冲掉可见区", async () => {
    const store = await liveStore();
    push("S1", [mk(0), mk(1)]);
    rings.delete("S1");
    store.setBufferCapacity(8_000);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0, 1]);
  });

  it("paused 不增加 pending；跟滚中改过滤从镜像重建命中", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    store.setPaused(id, true);
    push("S1", [mk(0, { level: "E", msg: "e0" })]);
    expect(store.state.sessions[0]!.pendingCount).toBe(0);
    expect(store.state.sessions[0]!.visible).toHaveLength(0);
    await store.patchFilter(id, { levels: ["E"] });
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0]);
  });

  it("paused 窗口不追加；setPaused(false) 按 seq 补洞且不冲刷", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [mk(0, { msg: "kept" })]);
    store.setPaused(id, true);
    push("S1", [mk(1, { msg: "paused" })]);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["kept"]);
    await store.setPaused(id, false);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["kept", "paused"]);
  });

  it("过滤变严只从已有面板筛掉，镜像为空不得冲成空列表", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [mk(0, { level: "I", msg: "info" }), mk(1, { level: "E", msg: "err" })]);
    rings.delete("S1");
    await store.patchFilter(id, { levels: ["E"] });
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["err"]);
  });

  it("后台丢推送后回前台 resumeVisible 从环补齐全部（切换应用场景）", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [mk(0), mk(1)]);
    // 模拟切到别的应用期间：seq 2..41 的批次全部没送到 UI（丢推送不丢环）
    remember(
      "S1",
      Array.from({ length: 40 }, (_, i) => mk(i + 2)),
      store.state.bufferCapacity,
    );
    remember("S1", [mk(42)], store.state.bufferCapacity);
    // 回前台只收到最后一拍水位（到 seq 42，前面 2..41 未单独送信号）
    mocks.logHitsHandlers.at(-1)?.({
      serial: "S1",
      window_id: id,
      total: 43,
      appended: 1,
      last_seq: 42,
    });
    // 回到前台：resumeVisible 应对所有在采窗口从环重新对账
    store.resumeVisible();
    await vi.waitFor(() => {
      expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual(
        Array.from({ length: 43 }, (_, i) => i),
      );
    });
  });

  it("容量口径：文档是缓存，重绑后只显示环仍持有的行（已被环淘汰的行不再显示）", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [mk(0), mk(1), mk(2), mk(3)]);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3]);
    // 环按容量淘汰了 0、1，只剩 2、3
    rings.set("S1", [mk(2), mk(3)]);
    await store.patchFilter(id, { keyword: "" });
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([2, 3]);
  });

  it("环拉取遇上在途整页回补：不丢行、不重复", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [mk(0), mk(1)]);
    // 环里已有 2、3，但信号尚未送达
    remember("S1", [mk(2), mk(3)], store.state.bufferCapacity);

    // 回前台触发的整页 bind 延迟解析（模拟在途页）
    let releaseBind!: () => void;
    let snapshot: LogPage | undefined;
    mocks.logWindowBind.mockImplementationOnce((spec: LogWindowBind) => {
      snapshot = pageFor(spec);
      return new Promise<LogPage>((resolve) => {
        releaseBind = () => resolve(snapshot!);
      });
    });
    store.resumeVisible();
    await vi.waitFor(() => expect(releaseBind).toBeDefined());

    // 在途期间又来一条 seq4 的水位：UI 从环按游标补齐 2、3、4
    remember("S1", [mk(4)], store.state.bufferCapacity);
    mocks.logHitsHandlers.at(-1)?.({
      serial: "S1",
      window_id: id,
      total: 5,
      appended: 1,
      last_seq: 4,
    });
    await vi.waitFor(() => {
      expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3, 4]);
    });

    // 迟到的整页 bind 解析后仍不得丢行/重复
    releaseBind();
    await vi.waitFor(() => {
      expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3, 4]);
    });
  });

  it("过滤窗口（非全量）命中间隔不误判空洞、不反复整页回补", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    await store.patchFilter(id, { levels: ["E"] });
    const binds = mocks.logWindowBind.mock.calls.length;
    push("S1", [
      mk(0, { level: "I" }),
      mk(1, { level: "E" }),
      mk(2, { level: "I" }),
      mk(3, { level: "E" }),
    ]);
    await Promise.resolve();
    expect(mocks.logWindowBind.mock.calls.length).toBe(binds);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([1, 3]);
  });

  it("丢批后下一次水位一次性从环补齐（无需整页 bind）", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [mk(0), mk(1)]);
    // seq 2、3 的信号丢失，环里仍在
    remember("S1", [mk(2), mk(3)], store.state.bufferCapacity);
    const bindsBefore = mocks.logWindowBind.mock.calls.length;
    remember("S1", [mk(4)], store.state.bufferCapacity);
    // 只收到水位 last_seq=4：UI 应从环把 2、3、4 一次补齐
    mocks.logHitsHandlers.at(-1)?.({
      serial: "S1",
      window_id: id,
      total: 5,
      appended: 1,
      last_seq: 4,
    });
    await vi.waitFor(() => {
      expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3, 4]);
    });
    expect(mocks.logWindowBind.mock.calls.length).toBe(bindsBefore);
  });

  it("掉线：停采集、清镜像，已画出的行保留", async () => {
    const store = await liveStore();
    push("S1", [mk(0, { msg: "kept" })]);
    expect(ringSize("S1")).toBe(1);
    expect(store.state.sessions[0]!.capturing).toBe(true);
    mocks.deviceOfflineHandlers.at(-1)?.({ serial: "S1" });
    expect(store.state.sessions[0]!.capturing).toBe(false);
    expect(anyCapturing(store)).toBe(false);
    expect(ringSize("S1")).toBe(1);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["kept"]);
  });

  it("停止采集不冲掉已画出的行", async () => {
    const store = await liveStore();
    push("S1", [mk(0, { msg: "kept" })]);
    await store.stopCapture();
    expect(store.state.sessions[0]!.capturing).toBe(false);
    expect(store.state.sessions[0]!.following).toBe(false);
    expect(store.state.sessions[0]!.frozenThroughSeq).toBe(0);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["kept"]);
  });

  it("停止后再开始仍从尾页跟新行", async () => {
    const store = await liveStore();
    push("S1", [mk(0, { msg: "old" })]);
    await store.stopCapture();
    await store.startCapture();
    const lines = Array.from({ length: 100 }, (_, i) => mk(i + 1, { msg: `n${i}` }));
    push("S1", lines);
    const session = store.state.sessions[0]!;
    expect(session.following).toBe(true);
    expect(session.pendingCount).toBe(0);
    expect(session.visible).toHaveLength(100);
    expect(session.visible[0]?.line.msg).toBe("n0");
    expect(session.visible.at(-1)?.line.msg).toBe("n99");
  });

  it("startCapture/stopCapture 走 IPC 并同步窗口状态", async () => {
    const store = wiredStore();
    await store.startCapture();
    expect(mocks.logCaptureStart).toHaveBeenCalledWith("S1");
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(anyCapturing(store)).toBe(true);
    await store.stopCapture();
    expect(mocks.logCaptureStop).toHaveBeenCalledWith("S1");
    expect(store.state.sessions[0]!.capturing).toBe(false);
    expect(anyCapturing(store)).toBe(false);
  });

  it("startCapture 清空镜像，只保留启动后的行", async () => {
    const store = wiredStore();
    push("S1", [mk(0)]);
    expect(ringSize("S1")).toBe(1);
    await store.startCapture();
    expect(ringSize("S1")).toBe(0);
    expect(store.state.sessions[0]!.visible).toHaveLength(0);
    push("S1", [mk(1, { msg: "after-start" })]);
    expect(store.state.sessions[0]!.visible).toHaveLength(1);
    expect(store.state.sessions[0]!.visible[0]!.line.msg).toBe("after-start");
    await store.stopCapture();
  });

  it("startCapture 经 log.window.bind 填入当前页（事件丢失兜底）", async () => {
    const line = mk(3, { msg: "from-replay" });
    mocks.logWindowBind.mockResolvedValueOnce({
      window_id: 1,
      serial: "S1",
      total: 1,
      lines: [line],
    });
    const store = wiredStore();
    await store.startCapture();
    expect(mocks.logWindowBind).toHaveBeenCalled();
    expect(store.state.sessions[0]!.visible[0]!.line.msg).toBe("from-replay");
    await store.stopCapture();
  });

  it("exportSession 显式接窗口 id，把该窗口过滤交给 log.export 并回读条数", async () => {
    const store = wiredStore();
    await store.startCapture();
    mocks.logExport.mockResolvedValueOnce({ path: "D:\\out.txt", lines: 7 });
    const id = store.state.sessions[0]!.id;
    const result = await store.exportSession(id, "D:\\out.txt");
    expect(mocks.logExport).toHaveBeenCalledWith(
      expect.objectContaining({
        serial: "S1",
        from_seq: 0,
        path: "D:\\out.txt",
        filter: expect.objectContaining({ scope: { kind: "all" } }),
      }),
    );
    expect(result).toEqual({ path: "D:\\out.txt", lines: 7 });
  });

  it("exportSession 从未采集的窗口返回 null 且不发 IPC", async () => {
    const store = wiredStore();
    const id = store.state.sessions[0]!.id;
    const result = await store.exportSession(id);
    expect(result).toBeNull();
    expect(mocks.logExport).not.toHaveBeenCalled();
  });

  it("重叠 start 闸门串行：首次 IPC，第二次已 capturing 则跳过", async () => {
    let release!: () => void;
    mocks.logCaptureStart.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve({ serial: "S1", generation: 1, adopted: false });
      }),
    );
    const store = track(createLogStore());
    await store.bindSerial("S1");
    store.ensureSession();
    const a = store.startCapture();
    const b = store.startCapture();
    await vi.waitFor(() => {
      expect(mocks.logCaptureStart).toHaveBeenCalledTimes(1);
      expect(store.state.sessions[0]!.starting).toBe(true);
    });
    expect(store.state.sessions[0]!.capturing).toBe(false);
    release();
    await Promise.all([a, b]);
    expect(mocks.logCaptureStart).toHaveBeenCalledTimes(1);
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(generationOf(store, "S1")).toBe(1);
    expect(store.state.sessions[0]!.starting).toBe(false);
  });

  it("同设备 bindSerial 不 stop、不改窗口 capturing", async () => {
    const store = track(createLogStore());
    await store.bindSerial("S1");
    store.ensureSession();
    await store.startCapture();
    expect(store.state.sessions[0]!.capturing).toBe(true);
    mocks.logCaptureStatus.mockResolvedValueOnce({
      serial: "S1",
      capturing: true,
      generation: 7,
    });
    await store.bindSerial("S1");
    expect(mocks.logCaptureStop).not.toHaveBeenCalled();
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(generationOf(store, "S1")).toBe(7);
  });

  it("start 失败则窗口不订阅", async () => {
    const store = track(createLogStore());
    await store.bindSerial("S1");
    store.ensureSession();
    mocks.logCaptureStart.mockRejectedValueOnce(new Error("ipc"));
    await expect(store.startCapture()).rejects.toThrow("ipc");
    expect(store.state.sessions[0]!.starting).toBe(false);
    expect(store.state.sessions[0]!.capturing).toBe(false);
  });

  it("start 返回后 status 未采集则窗口不标成采集中", async () => {
    const store = track(createLogStore());
    await store.bindSerial("S1");
    store.ensureSession();
    mocks.logCaptureStart.mockResolvedValueOnce({ serial: "S1", generation: 4, adopted: false });
    mocks.logCaptureStatus.mockResolvedValueOnce({
      serial: "S1",
      capturing: false,
      generation: 0,
    });
    await store.startCapture();
    expect(mocks.logCaptureStart).toHaveBeenCalledWith("S1");
    expect(store.state.sessions[0]!.capturing).toBe(false);
    expect(store.state.sessions[0]!.starting).toBe(false);
    expect(mocks.logCaptureStop).toHaveBeenCalledWith("S1");
  });

  it("start 成功后若 status 世代已结束则纠正窗口 capturing", async () => {
    const store = track(createLogStore());
    await store.bindSerial("S1");
    store.ensureSession();
    mocks.logCaptureStatus.mockResolvedValueOnce({
      serial: "S1",
      capturing: false,
      generation: 1,
    });
    await store.startCapture();
    expect(store.state.sessions[0]!.capturing).toBe(false);
    expect(generationOf(store, "S1")).toBe(1);
    expect(store.state.sessions[0]!.starting).toBe(false);
  });

  it("后开窗口 status 已结束只退订自己，不误伤同设备兄弟窗口", async () => {
    const store = await liveStore();
    const system = store.state.sessions[0]!;
    const other = store.createSession({ kind: "all" }, "A");
    store.setActive(other);
    mocks.logCaptureStatus.mockResolvedValueOnce({
      serial: "S1",
      capturing: false,
      generation: 1,
    });
    await store.startCapture();
    expect(store.state.sessions.find((s) => s.id === other)!.capturing).toBe(false);
    expect(store.state.sessions.find((s) => s.id === system.id)!.capturing).toBe(true);
    push("S1", [mk(0, { msg: "sibling-still-live" })]);
    expect(store.state.sessions.find((s) => s.id === system.id)!.visible[0]!.line.msg).toBe("sibling-still-live");
    expect(store.state.sessions.find((s) => s.id === other)!.visible).toHaveLength(0);
  });

  it("starting 期间 stop 立即发 stop IPC，不等待 start 返回", async () => {
    let releaseStart!: (value: { serial: string; generation: number; adopted: boolean }) => void;
    mocks.logCaptureStart.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseStart = resolve;
      }),
    );
    const store = track(createLogStore());
    await store.bindSerial("S1");
    store.ensureSession();
    const starting = store.startCapture();
    await vi.waitFor(() => {
      expect(store.state.sessions[0]!.starting).toBe(true);
    });
    const stopping = store.stopCapture();
    expect(mocks.logCaptureStop).toHaveBeenCalledWith("S1");
    releaseStart({ serial: "S1", generation: 1, adopted: false });
    await starting.catch(() => undefined);
    await stopping;
    expect(store.state.sessions[0]!.starting).toBe(false);
    expect(store.state.sessions[0]!.capturing).toBe(false);
  });

  it("start 失败且 status 未采集时 capturing 保持 false", async () => {
    const store = track(createLogStore());
    await store.bindSerial("S1");
    store.ensureSession();
    mocks.logCaptureStart.mockRejectedValueOnce(new Error("offline"));
    await expect(store.startCapture()).rejects.toThrow("offline");
    expect(store.state.sessions[0]!.starting).toBe(false);
    expect(store.state.sessions[0]!.capturing).toBe(false);
  });

  it("Stop 入队后再 Start：先停后开，不会吞掉第二次 Start", async () => {
    const store = track(createLogStore());
    await store.bindSerial("S1");
    store.ensureSession();
    await store.startCapture();
    let releaseStop!: () => void;
    mocks.logCaptureStop.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        releaseStop = resolve;
      }),
    );
    mocks.logCaptureStart.mockResolvedValueOnce({ serial: "S1", generation: 2, adopted: false });
    const stopping = store.stopCapture();
    const starting = store.startCapture();
    expect(mocks.logCaptureStart).toHaveBeenCalledTimes(1);
    releaseStop();
    await stopping;
    await starting;
    expect(mocks.logCaptureStart).toHaveBeenCalledTimes(2);
    expect(generationOf(store, "S1")).toBe(2);
    expect(store.state.sessions[0]!.capturing).toBe(true);
  });

  it("窗口点开始先打 processSnapshot 再启流", async () => {
    const store = wiredStore();
    const order: string[] = [];
    mocks.logProcessSnapshot.mockImplementation(async () => {
      order.push("ps");
      return [];
    });
    mocks.logCaptureStart.mockImplementation(async (serial: unknown) => {
      order.push("start");
      return { serial, generation: 1, adopted: false };
    });
    await store.startCapture();
    expect(order).toEqual(["ps", "start"]);
    expect(store.state.sessions[0]!.fromSeq).toBe(0);
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.sessions[0]!.following).toBe(true);
    expect(store.state.sessions[0]!.frozenThroughSeq).toBeNull();
    expect(store.state.sessions[0]!.pendingCount).toBe(0);
  });

  it("refreshPackages 写入已安装包名，不覆盖进程索引", async () => {
    const store = wiredStore();
    mocks.logProcessSnapshot.mockResolvedValue([{ pid: 10, name: "com.running" }]);
    mocks.logPackageSnapshot.mockResolvedValue(["com.idle.app", "com.running"]);
    await store.refreshProcesses("S1");
    await store.refreshPackages("S1");
    expect(mocks.logPackageSnapshot).toHaveBeenCalledWith("S1");
    expect(store.state.devices.S1?.processEntries).toEqual([{ pid: 10, name: "com.running" }]);
    expect(store.state.devices.S1?.packages).toEqual(["com.idle.app", "com.running"]);
    expect(store.state.devices.S1?.packagesDegraded).toBe(false);
  });

  it("新窗口第一次开始：fromSeq=0，按过滤从当前环补齐，不清空镜像", async () => {
    const store = wiredStore();
    push("S1", [mk(0, { msg: "kept" })]);
    mocks.logCaptureStart.mockResolvedValueOnce({ serial: "S1", generation: 4, adopted: true });
    await store.startCapture();
    expect(ringSize("S1")).toBe(1);
    expect(store.state.sessions[0]!.fromSeq).toBe(0);
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["kept"]);
    expect(generationOf(store, "S1")).toBe(4);
    push("S1", [mk(1, { msg: "fresh" })]);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["kept", "fresh"]);
  });

  it("同窗口 adopt 续采：保留 fromSeq 与可见区，只补新行", async () => {
    const store = await liveStore();
    push("S1", [mk(0, { msg: "kept" })]);
    expect(store.state.sessions[0]!.fromSeq).toBe(0);
    await store.stopCapture();
    mocks.logCaptureStart.mockResolvedValueOnce({ serial: "S1", generation: 1, adopted: true });
    mocks.logCaptureStatus.mockResolvedValue({
      serial: "S1",
      capturing: true,
      generation: 1,
    });
    await store.startCapture();
    expect(store.state.sessions[0]!.fromSeq).toBe(0);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["kept"]);
    push("S1", [mk(1, { msg: "fresh" })]);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["kept", "fresh"]);
  });

  it("迟到的旧世代 Stopped 不能打断新世代", async () => {
    const store = wiredStore();
    await store.startCapture();
    expect(store.state.sessions[0]!.capturing).toBe(true);
    mocks.logCaptureStart.mockResolvedValueOnce({ serial: "S1", generation: 2, adopted: false });
    await store.stopCapture();
    await store.startCapture();
    expect(generationOf(store, "S1")).toBe(2);
    expect(store.state.sessions[0]!.capturing).toBe(true);
    mocks.captureStateHandlers.at(-1)?.({ serial: "S1", generation: 1, state: "stopped" });
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(generationOf(store, "S1")).toBe(2);
  });

  it("切焦点不停已采设备，窗口仍收行", async () => {
    const store = await liveStore();
    expect(store.state.sessions[0]!.capturing).toBe(true);
    await store.bindSerial("S2");
    expect(mocks.logCaptureStop).not.toHaveBeenCalled();
    expect(store.state.serial).toBe("S2");
    expect(store.state.sessions[0]!.serial).toBe("S1");
    expect(store.state.sessions[0]!.capturing).toBe(true);
    push("S1", [mk(0, { msg: "still" })]);
    expect(store.state.sessions[0]!.visible[0]!.line.msg).toBe("still");
  });

  it("包名窗口创建时绑定进程但不重放历史行", async () => {
    const store = await liveStore();
    push("S1", [
      mk(0, { pid: 10, msg: "foo" }),
      mk(1, { pid: 99, msg: "other" }),
    ]);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      generation: 1,
      entries: [{ pid: 10, name: "com.foo" }],
      degraded: false,
    });
    const id = store.createSession({ kind: "package", pkg: "com.foo", includeChild: false }, "com.foo");
    const session = store.state.sessions.find((s) => s.id === id)!;
    expect(session.visible).toHaveLength(0);
    expect(session.capturing).toBe(false);
    expect(pidSetOf(session.binding)).toEqual([10]);
  });

  it("包名窗口点开始立即从当前环补齐匹配行，不等下一次触摸", async () => {
    const store = await liveStore();
    push("S1", [
      mk(0, { pid: 10, msg: "foo" }),
      mk(1, { pid: 99, msg: "other" }),
    ]);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      generation: 1,
      entries: [{ pid: 10, name: "com.foo" }],
      degraded: false,
    });
    mocks.logProcessSnapshot.mockResolvedValue([{ pid: 10, name: "com.foo" }]);
    const id = store.createSession({ kind: "package", pkg: "com.foo", includeChild: false }, "com.foo");
    store.setActive(id);
    await store.startCapture();
    const session = store.state.sessions.find((s) => s.id === id)!;
    expect(session.capturing).toBe(true);
    expect(session.fromSeq).toBe(0);
    expect(session.visible.map((r) => r.line.msg)).toEqual(["foo"]);
    expect(mocks.logCaptureStart).toHaveBeenCalledTimes(1);
  });

  it("采集中的包名窗口在进程索引更新后按 seq 补齐新 PID 行", async () => {
    const store = wiredStore();
    const id = store.createSession({ kind: "package", pkg: "com.foo", includeChild: false }, "com.foo");
    store.setActive(id);
    await store.startCapture();
    push("S1", [mk(0, { pid: 42, msg: "after-rebind" })]);
    expect(store.state.sessions.find((s) => s.id === id)!.visible).toHaveLength(0);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      generation: 1,
      entries: [{ pid: 42, name: "com.foo" }],
      degraded: false,
    });
    await vi.waitFor(() => {
      expect(store.state.sessions.find((s) => s.id === id)!.visible.map((r) => r.line.msg)).toEqual(["after-rebind"]);
    });
  });

  it("包名窗口 PID 重绑不得冲掉已画出的行，即便镜像已被清空", async () => {
    const store = wiredStore();
    const id = store.createSession({ kind: "package", pkg: "com.foo", includeChild: false }, "com.foo");
    store.setActive(id);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      generation: 1,
      entries: [{ pid: 10, name: "com.foo" }],
      degraded: false,
    });
    await store.startCapture();
    push("S1", [mk(0, { pid: 10, msg: "kept" })]);
    expect(store.state.sessions.find((s) => s.id === id)!.visible.map((r) => r.line.msg)).toEqual(["kept"]);
    rings.delete("S1");
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      generation: 1,
      entries: [{ pid: 99, name: "com.foo" }],
      degraded: false,
    });
    expect(store.state.sessions.find((s) => s.id === id)!.visible.map((r) => r.line.msg)).toEqual(["kept"]);
    expect(store.state.sessions.find((s) => s.id === id)!.binding.current).toEqual([99]);
  });
});

describe("logStore 多窗口 × 多设备", () => {
  it("两窗口同设备：只停当前，末窗口停止才 log.capture.stop", async () => {
    const store = await liveStore();
    const system = store.state.sessions[0]!;
    push("S1", [mk(0), mk(1)]);
    const other = store.createSession({ kind: "all" }, "A");
    store.setActive(other);
    await store.startCapture();
    expect(mocks.logCaptureStart).toHaveBeenCalledTimes(1);
    expect(store.state.sessions.find((s) => s.id === other)!.visible.map((r) => r.line.seq)).toEqual([0, 1]);
    push("S1", [mk(2), mk(3)]);
    expect(store.state.sessions.find((s) => s.id === system.id)!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3]);
    expect(store.state.sessions.find((s) => s.id === other)!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3]);

    await store.stopCapture();
    expect(mocks.logCaptureStop).not.toHaveBeenCalled();
    expect(store.state.sessions.find((s) => s.id === other)!.capturing).toBe(false);
    expect(store.state.sessions.find((s) => s.id === system.id)!.capturing).toBe(true);
    push("S1", [mk(4)]);
    expect(store.state.sessions.find((s) => s.id === other)!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3]);
    expect(store.state.sessions.find((s) => s.id === system.id)!.visible.map((r) => r.line.seq)).toEqual([0, 1, 2, 3, 4]);

    store.setActive(system.id);
    await store.stopCapture();
    expect(mocks.logCaptureStop).toHaveBeenCalledTimes(1);
    expect(mocks.logCaptureStop).toHaveBeenCalledWith("S1");
  });

  it("兄窗仍 hold 时停包名窗：进程索引与改过滤不得再写入已停窗口", async () => {
    const store = await liveStore();
    const system = store.state.sessions[0]!;
    const pkg = store.createSession({ kind: "package", pkg: "com.foo", includeChild: false }, "com.foo");
    store.setActive(pkg);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      generation: 1,
      entries: [{ pid: 10, name: "com.foo" }],
      degraded: false,
    });
    await store.startCapture();
    push("S1", [mk(0, { pid: 10, msg: "before-stop" }), mk(1, { pid: 99, msg: "sys" })]);
    await store.stopCapture();
    expect(store.state.sessions.find((s) => s.id === pkg)!.capturing).toBe(false);
    expect(store.state.sessions.find((s) => s.id === pkg)!.following).toBe(false);
    expect(store.state.sessions.find((s) => s.id === system.id)!.capturing).toBe(true);

    push("S1", [mk(2, { pid: 10, msg: "after-stop" })]);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      generation: 1,
      entries: [{ pid: 10, name: "com.foo" }],
      degraded: false,
    });
    store.patchFilter(pkg, { keyword: "" });

    expect(store.state.sessions.find((s) => s.id === pkg)!.visible.map((r) => r.line.msg)).toEqual([
      "before-stop",
    ]);
    expect(store.state.sessions.find((s) => s.id === system.id)!.visible.map((r) => r.line.msg)).toEqual([
      "before-stop",
      "sys",
      "after-stop",
    ]);
  });

  it("两窗口两设备：各打一次 start；停 A 不 stop B", async () => {
    const store = wiredStore();
    await store.startCapture();
    mocks.logCaptureStart.mockImplementation(async (serial: unknown) => ({
      serial,
      generation: serial === "S2" ? 8 : 1,
      adopted: false,
    }));
    const b = store.createSession({ kind: "all" }, "B", "S2");
    store.setActive(b);
    await store.startCapture();
    expect(mocks.logCaptureStart).toHaveBeenCalledWith("S1");
    expect(mocks.logCaptureStart).toHaveBeenCalledWith("S2");
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.sessions.find((s) => s.id === b)!.capturing).toBe(true);

    await store.stopCapture();
    expect(mocks.logCaptureStop).toHaveBeenCalledTimes(1);
    expect(mocks.logCaptureStop).toHaveBeenCalledWith("S2");
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.sessions.find((s) => s.id === b)!.capturing).toBe(false);

    push("S1", [mk(0, { msg: "a-still" })]);
    expect(store.state.sessions[0]!.visible[0]!.line.msg).toBe("a-still");
  });

  it("掉线只影响该 serial 的窗口", async () => {
    const store = wiredStore();
    await store.startCapture();
    const b = store.createSession({ kind: "all" }, "B", "S2");
    store.setActive(b);
    mocks.logCaptureStart.mockResolvedValueOnce({ serial: "S2", generation: 3, adopted: false });
    await store.startCapture();
    push("S1", [mk(0, { msg: "keep-a" })]);
    push("S2", [mk(0, { msg: "drop-b" })]);
    mocks.deviceOfflineHandlers.at(-1)?.({ serial: "S2" });
    expect(store.state.sessions.find((s) => s.id === b)!.capturing).toBe(false);
    expect(store.state.sessions.find((s) => s.id === b)!.visible[0]!.line.msg).toBe("drop-b");
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(store.state.sessions[0]!.visible[0]!.line.msg).toBe("keep-a");
    expect(ringSize("S1")).toBe(1);
    expect(ringSize("S2")).toBe(1);
  });

  it("进程索引按设备分桶：B 的 ps 不改写 A 的包名绑定", async () => {
    const store = wiredStore();
    const a = store.createSession({ kind: "package", pkg: "com.foo", includeChild: false }, "com.foo", "S1");
    store.setActive(a);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      generation: 1,
      entries: [{ pid: 10, name: "com.foo" }],
      degraded: false,
    });
    expect(pidSetOf(store.state.sessions.find((s) => s.id === a)!.binding)).toEqual([10]);

    const b = store.createSession({ kind: "package", pkg: "com.bar", includeChild: false }, "com.bar", "S2");
    store.setActive(b);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S2",
      generation: 1,
      entries: [{ pid: 99, name: "com.bar" }],
      degraded: false,
    });
    expect(pidSetOf(store.state.sessions.find((s) => s.id === a)!.binding)).toEqual([10]);
    expect(pidSetOf(store.state.sessions.find((s) => s.id === b)!.binding)).toEqual([99]);
    expect(store.state.devices.S1?.processEntries).toEqual([{ pid: 10, name: "com.foo" }]);
    expect(store.state.devices.S2?.processEntries).toEqual([{ pid: 99, name: "com.bar" }]);
  });

  it("过滤变更用本窗口设备的进程索引重绑", async () => {
    const store = wiredStore();
    const a = store.createSession({ kind: "package", pkg: "com.foo", includeChild: true }, "com.foo", "S1");
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      generation: 1,
      entries: [
        { pid: 10, name: "com.foo" },
        { pid: 11, name: "com.foo:svc" },
      ],
      degraded: false,
    });
    store.createSession({ kind: "all" }, "B", "S2");
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S2",
      generation: 1,
      entries: [{ pid: 50, name: "com.foo" }],
      degraded: false,
    });
    store.patchFilter(a, { tagContains: "x" });
    expect(pidSetOf(store.state.sessions.find((s) => s.id === a)!.binding).sort((x, y) => x - y)).toEqual([10, 11]);
  });

  it("不同设备 start 互不等待同一把闸门", async () => {
    let releaseS1!: () => void;
    mocks.logCaptureStart.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseS1 = () => resolve({ serial: "S1", generation: 1, adopted: false });
        }),
    );
    const store = wiredStore();
    const startingS1 = store.startCapture();
    await vi.waitFor(() => {
      expect(store.state.sessions[0]!.starting).toBe(true);
    });
    const b = store.createSession({ kind: "all" }, "B", "S2");
    store.setActive(b);
    mocks.logCaptureStart.mockResolvedValueOnce({ serial: "S2", generation: 8, adopted: false });
    await store.startCapture();
    expect(mocks.logCaptureStart).toHaveBeenCalledWith("S2");
    expect(store.state.sessions.find((s) => s.id === b)!.capturing).toBe(true);
    expect(store.state.sessions[0]!.capturing).toBe(false);
    releaseS1();
    await startingS1;
    expect(store.state.sessions[0]!.capturing).toBe(true);
  });
});

describe("logStore 窗口 hold 引用", () => {
  it("关闭 starting 窗口必 stop 且不订新 System", async () => {
    let releaseStart!: (value: { serial: string; generation: number; adopted: boolean }) => void;
    mocks.logCaptureStart.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseStart = resolve;
      }),
    );
    const store = track(createLogStore());
    await store.bindSerial("S1");
    store.ensureSession();
    const id = store.state.sessions[0]!.id;
    const starting = store.startCapture();
    await vi.waitFor(() => {
      expect(store.state.sessions[0]!.starting).toBe(true);
    });
    store.closeSession(id);
    expect(mocks.logCaptureStop).toHaveBeenCalledWith("S1");
    const rebuilt = store.state.sessions[0]!;
    expect(rebuilt.id).not.toBe(id);
    expect(rebuilt.capturing).toBe(false);
    expect(rebuilt.starting).toBe(false);
    releaseStart({ serial: "S1", generation: 1, adopted: false });
    await starting;
    expect(store.state.sessions[0]!.id).not.toBe(id);
    expect(store.state.sessions[0]!.capturing).toBe(false);
    expect(store.state.sessions[0]!.starting).toBe(false);
  });

  it("await 中删兄窗仍订原 id", async () => {
    const store = await liveStore();
    const systemId = store.state.sessions[0]!.id;
    const other = store.createSession({ kind: "all" }, "A");
    store.setActive(other);
    let releasePs!: () => void;
    mocks.logProcessSnapshot.mockReturnValueOnce(
      new Promise((resolve) => {
        releasePs = () => resolve([]);
      }),
    );
    const starting = store.startCapture();
    await vi.waitFor(() => {
      expect(store.state.sessions.find((s) => s.id === other)!.starting).toBe(true);
    });
    store.closeSession(systemId);
    expect(store.state.sessions.find((s) => s.id === systemId)).toBeUndefined();
    releasePs();
    await starting;
    const live = store.state.sessions.find((s) => s.id === other);
    expect(live).toBeTruthy();
    expect(live!.capturing).toBe(true);
    expect(live!.starting).toBe(false);
    expect(store.state.sessions[0]!.id).toBe(other);
  });

  it("兄 live 时取消启动不 stop", async () => {
    const store = await liveStore();
    const system = store.state.sessions[0]!;
    const other = store.createSession({ kind: "all" }, "A");
    store.setActive(other);
    let releasePs!: () => void;
    mocks.logProcessSnapshot.mockReturnValueOnce(
      new Promise((resolve) => {
        releasePs = () => resolve([]);
      }),
    );
    const starting = store.startCapture();
    await vi.waitFor(() => {
      expect(store.state.sessions.find((s) => s.id === other)!.starting).toBe(true);
    });
    const stopping = store.stopCapture();
    expect(mocks.logCaptureStop).not.toHaveBeenCalled();
    releasePs();
    await starting;
    await stopping;
    expect(mocks.logCaptureStop).not.toHaveBeenCalled();
    expect(store.state.sessions.find((s) => s.id === other)!.capturing).toBe(false);
    expect(store.state.sessions.find((s) => s.id === other)!.starting).toBe(false);
    expect(store.state.sessions.find((s) => s.id === system.id)!.capturing).toBe(true);
  });

  it("无 serial 的 start/stop 直接返回，不 throw、不 IPC", async () => {
    const store = track(createLogStore());
    store.ensureSession();
    await expect(store.startCapture()).resolves.toBeUndefined();
    expect(mocks.logCaptureStart).not.toHaveBeenCalled();
    await expect(store.stopCapture()).resolves.toBeUndefined();
    expect(mocks.logCaptureStop).not.toHaveBeenCalled();
  });

  it("adopt 同世代不回拨，窗口保持订阅", async () => {
    const store = await liveStore();
    expect(generationOf(store, "S1")).toBe(1);
    await store.stopCapture();
    mocks.logCaptureStart.mockResolvedValueOnce({ serial: "S1", generation: 1, adopted: true });
    mocks.logCaptureStatus.mockResolvedValue({
      serial: "S1",
      capturing: true,
      generation: 1,
    });
    await store.startCapture();
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(generationOf(store, "S1")).toBe(1);
    mocks.captureStateHandlers.at(-1)?.({ serial: "S1", generation: 1, state: "running" });
    expect(store.state.sessions[0]!.capturing).toBe(true);
    expect(generationOf(store, "S1")).toBe(1);
  });

  it("掉线后过期 running 不抬世代、不订窗", async () => {
    const store = await liveStore();
    mocks.deviceOfflineHandlers.at(-1)?.({ serial: "S1" });
    expect(generationOf(store, "S1")).toBe(0);
    expect(store.state.sessions[0]!.capturing).toBe(false);
    mocks.captureStateHandlers.at(-1)?.({ serial: "S1", generation: 1, state: "running" });
    expect(generationOf(store, "S1")).toBe(0);
    expect(store.state.sessions[0]!.capturing).toBe(false);
  });
});

describe("logStore 设置联动", () => {
  it("清空可见区后 PID 重绑与改过滤不得把旧行投影回来", async () => {
    const store = wiredStore();
    const id = store.createSession({ kind: "package", pkg: "com.foo", includeChild: false }, "com.foo");
    store.setActive(id);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      generation: 1,
      entries: [{ pid: 10, name: "com.foo" }],
      degraded: false,
    });
    await store.startCapture();
    push("S1", [mk(0, { pid: 10, msg: "old" }), mk(1, { pid: 10, msg: "also-old" })]);
    expect(store.state.sessions.find((s) => s.id === id)!.visible).toHaveLength(2);
    await store.clearVisible(id);
    const cleared = store.state.sessions.find((s) => s.id === id)!;
    expect(cleared.visible).toHaveLength(0);
    expect(cleared.fromSeq).toBeGreaterThan(1);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      generation: 1,
      entries: [{ pid: 10, name: "com.foo" }],
      degraded: false,
    });
    store.patchFilter(id, { keyword: "" });
    store.resumeFollow(id);
    expect(store.state.sessions.find((s) => s.id === id)!.visible).toHaveLength(0);
    push("S1", [mk(2, { pid: 10, msg: "fresh" })]);
    expect(store.state.sessions.find((s) => s.id === id)!.visible.map((r) => r.line.msg)).toEqual(["fresh"]);
  });

  it("System 窗口清空后跟滚只收清空之后的新行", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [mk(0, { msg: "a" }), mk(1, { msg: "b" })]);
    await store.clearVisible(id);
    store.patchFilter(id, { keyword: "" });
    store.resumeFollow(id);
    expect(store.state.sessions[0]!.visible).toHaveLength(0);
    push("S1", [mk(2, { msg: "c" })]);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.msg)).toEqual(["c"]);
  });

  it("settings/changed buffer_capacity 立即裁剪镜像容量", async () => {
    const store = wiredStore();
    expect(store.state.bufferCapacity).toBe(10_000);
    mocks.settingsChangedHandlers.at(-1)?.({
      key: "buffer_capacity",
      settings: { buffer_capacity: 50 },
    });
    await vi.waitFor(() => {
      expect(store.state.bufferCapacity).toBe(50);
    });
  });

  it("settings/changed 展示列键不打 buffer_capacity", async () => {
    const store = wiredStore();
    mocks.settingsChangedHandlers.at(-1)?.({
      key: "log_display_columns",
      settings: { buffer_capacity: 10_000 },
    });
    await Promise.resolve();
    expect(store.state.bufferCapacity).toBe(10_000);
  });

  it("dispose 卸掉本实例订阅，不再吃后续批次", async () => {
    const store = wiredStore();
    store.dispose();
    const before = mocks.logHitsHandlers.length;
    await Promise.resolve();
    expect(mocks.logHitsHandlers.length).toBeLessThan(before);
    const leftover = mocks.logHitsHandlers.at(-1);
    leftover?.({
      serial: "S1",
      window_id: store.state.sessions[0]?.id ?? 0,
      total: 1,
      appended: 1,
      last_seq: 99,
    });
    expect(store.state.sessions[0]?.visible ?? []).toHaveLength(0);
  });
});

describe("世代 / 采集相 / 冻结上限单源", () => {
  it("status 对账不把世代写小：迟到旧 status 被 raiseDeviceGen 拒", async () => {
    const store = track(createLogStore());
    await store.bindSerial("S1");
    store.ensureSession();
    await store.startCapture();
    expect(generationOf(store, "S1")).toBe(1);
    // 后续 captureState 抬到 5，再回一次 generation=2 的 status。
    mocks.captureStateHandlers.at(-1)?.({ serial: "S1", generation: 5, state: "running" });
    expect(generationOf(store, "S1")).toBe(5);
    mocks.logCaptureStatus.mockResolvedValueOnce({ serial: "S1", capturing: true, generation: 2 });
    await store.bindSerial("S1");
    expect(generationOf(store, "S1")).toBe(5);
  });

  it("stop 后 status 世代的迟到写不入（只升不减）", async () => {
    const store = await liveStore();
    mocks.captureStateHandlers.at(-1)?.({ serial: "S1", generation: 9, state: "running" });
    expect(generationOf(store, "S1")).toBe(9);
    mocks.logCaptureStatus.mockResolvedValueOnce({ serial: "S1", capturing: false, generation: 3 });
    await store.stopCapture();
    expect(generationOf(store, "S1")).toBe(9);
  });

  it("清设备缓冲后 pendingCount / signalCount / docShift 归零，fromSeq 回 0", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [
      mk(0, { level: "E", tag: "AndroidRuntime", msg: "FATAL EXCEPTION: main" }),
      mk(1, { msg: "x" }),
    ]);
    store.detachFollow(id);
    push("S1", [mk(2, { msg: "y" })]);
    expect(store.state.sessions[0]!.pendingCount).toBeGreaterThan(0);
    await store.clearDevice();
    const session = store.state.sessions[0]!;
    expect(session.visible).toHaveLength(0);
    expect(session.pendingCount).toBe(0);
    expect(session.signalCount).toBe(0);
    expect(session.docShift).toBe(0);
    expect(session.fromSeq).toBe(0);
    expect(session.following).toBe(true);
    expect(session.frozenThroughSeq).toBeNull();
  });

  it("scope 切走后 binding 清空，不留第二份 pidSet", async () => {
    const store = await liveStore();
    const id = store.createSession({ kind: "package", pkg: "com.foo", includeChild: false }, "com.foo");
    store.setActive(id);
    mocks.processIndexHandlers.at(-1)?.({
      serial: "S1",
      generation: 1,
      entries: [{ pid: 10, name: "com.foo" }],
      degraded: false,
    });
    await store.startCapture();
    expect(pidSetOf(store.state.sessions.find((s) => s.id === id)!.binding)).toEqual([10]);
    store.patchFilter(id, { scope: { kind: "all" } });
    expect(pidSetOf(store.state.sessions.find((s) => s.id === id)!.binding)).toEqual([]);
  });

  it("docShift：整文档替换归零，追加裁头累加", async () => {
    const store = await liveStore();
    store.setBufferCapacity(2);
    push("S1", [mk(0), mk(1)]);
    push("S1", [mk(2)]);
    expect(store.state.sessions[0]!.visible.map((r) => r.line.seq)).toEqual([1, 2]);
    expect(store.state.sessions[0]!.docShift).toBe(1);
    const id = store.state.sessions[0]!.id;
    await store.patchFilter(id, { keyword: "" });
    expect(store.state.sessions[0]!.docShift).toBe(0);
  });

  it("冻结后新到的行按 frozenThroughSeq 记账：冻结点之前的回补不计 pending", async () => {
    const store = await liveStore();
    const id = store.state.sessions[0]!.id;
    push("S1", [mk(0)]);
    store.detachFollow(id);
    expect(store.state.sessions[0]!.frozenThroughSeq).toBe(0);
    // 冻结点之后新到的行 → pending +1
    push("S1", [mk(1)]);
    expect(store.state.sessions[0]!.pendingCount).toBe(1);
  });
});

describe("logStore 会话列视图（colChars / headShift 单源）", () => {
  it("写列宽/横滑进会话自身字段，切会话各自独立", () => {
    const store = wiredStore();
    const first = store.state.activeSessionId!;
    const second = store.createSession({ kind: "all" }, "T2", "S1");
    store.setColumnView(first, { colChars: { tag: 30 }, headShift: 12 });
    store.setColumnView(second, { colChars: { app: 40 } });

    store.setActive(first);
    const a = store.sessionById(first)!;
    expect(a.colChars).toEqual({ tag: 30 });
    expect(a.headShift).toBe(12);

    store.setActive(second);
    const b = store.sessionById(second)!;
    expect(b.colChars).toEqual({ app: 40 });
    expect(b.headShift).toBe(0);
  });

  it("关闭会话即随会话删除列视图，不残留", () => {
    const store = wiredStore();
    const first = store.state.activeSessionId!;
    store.setColumnView(first, { colChars: { pid: 20 }, headShift: 4 });
    store.closeSession(first);
    expect(store.sessionById(first)).toBeUndefined();
    const remaining = store.state.sessions[0]!;
    expect(remaining.colChars).toEqual({});
    expect(remaining.headShift).toBe(0);
  });

  it("未会话 id 写入静默忽略，不抛错", () => {
    const store = wiredStore();
    expect(() => store.setColumnView(999_999, { headShift: 3 })).not.toThrow();
  });
});
