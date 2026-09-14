/**
 * 设备 store：扫描失败链路（主错误进 lastError；adb 提示在 store 拼；二次失败 warn）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deviceList: vi.fn(),
  deviceRefresh: vi.fn(),
  deviceStatus: vi.fn(),
  systemInfo: vi.fn(),
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  return {
    ...actual,
    deviceList: (...a: unknown[]) => mocks.deviceList(...a),
    deviceRefresh: (...a: unknown[]) => mocks.deviceRefresh(...a),
    deviceStatus: (...a: unknown[]) => mocks.deviceStatus(...a),
    systemInfo: (...a: unknown[]) => mocks.systemInfo(...a),
  };
});

import { YoLog } from "@yohu/api";

import { createDeviceStore } from "./device-store";

const SCAN_ERR = { code: "adb_error" as const, message: "adb 未找到" };
const ADB_PATH = "C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\data\\tools\\adb\\adb.exe";

function infoSnapshot(adbPath: string) {
  return {
    identity: { display_name: "Yohu", package_id: "com.yohu.adbtools", version: "0.1.0" },
    paths: {},
    adb_path: adbPath,
    settings: {},
    os: "windows",
  };
}

describe("deviceStore 扫描失败", () => {
  beforeEach(() => {
    mocks.deviceList.mockResolvedValue([]);
    mocks.deviceRefresh.mockRejectedValue(SCAN_ERR);
    mocks.deviceStatus.mockResolvedValue([]);
    mocks.systemInfo.mockResolvedValue(infoSnapshot(ADB_PATH));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("扫描失败后 lastError 带 store 拼的 adb 路径", async () => {
    const store = createDeviceStore();
    await store.refresh();
    expect(store.state.lastError).toBe(`adb 未找到；adb: ${ADB_PATH}`);
    expect(store.state.statusText).toBe("设备扫描失败");
    expect(mocks.systemInfo).toHaveBeenCalledTimes(1);
  });

  it("adb_path 为空时拼「adb 未解析」", async () => {
    mocks.systemInfo.mockResolvedValue(infoSnapshot(""));
    const store = createDeviceStore();
    await store.refresh();
    expect(store.state.lastError).toBe("adb 未找到；adb 未解析");
  });

  it("system.info 再失败只保留主错误，并 YoLog.warn", async () => {
    mocks.systemInfo.mockRejectedValue({ code: "internal", message: "info 挂了" });
    const warn = vi.spyOn(YoLog, "warn");
    const store = createDeviceStore();
    await store.refresh();
    expect(store.state.lastError).toBe("adb 未找到");
    expect(store.state.statusText).toBe("设备扫描失败");
    expect(warn).toHaveBeenCalledWith("device", "读取 adb 路径失败 info 挂了");
  });
});
