/**
 * 设备 store：扫描失败链路（主错误进 lastError；adb 提示在 store 拼；二次失败 warn）。
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

import { createDeviceStore, deviceCatalogIsEmpty, deviceScanHasError } from "./device-store";

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

  it("成功目录快照清掉上一次扫描错误", async () => {
    const store = createDeviceStore();
    await store.refresh();
    expect(store.state.lastError).toBe(`adb 未找到；adb: ${ADB_PATH}`);
    mocks.deviceRefresh.mockResolvedValueOnce([]);
    await store.refresh();
    expect(store.state.lastError).toBe("");
    expect(store.state.statusText).toBe("无在线设备");
  });
});

function productionSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...productionSources(path));
    else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.includes(".test.")
    ) {
      out.push(path);
    }
  }
  return out;
}

describe("目录空与扫描错误只判一次", () => {
  it("空目录和有错误明细", () => {
    expect(deviceCatalogIsEmpty([])).toBe(true);
    expect(
      deviceCatalogIsEmpty([{ serial: "A", state: "online", connection: "usb" }]),
    ).toBe(false);
    expect(deviceScanHasError("")).toBe(false);
    expect(deviceScanHasError("adb 未找到")).toBe(true);
  });

  it("生产源不再自己比目录长度或错误明细", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const file of productionSources(root)) {
      let body = readFileSync(file, "utf8");
      if (file.endsWith("device-store.ts")) {
        body = body.replace("return devices.length === 0;", "").replace("return lastError.length > 0;", "");
      }
      expect(body, file).not.toContain(".devices.length === 0");
      expect(body, file).not.toContain(".devices.length > 0");
      expect(body, file).not.toContain("devices.length > 0");
      expect(body, file).not.toContain("lastError ||");
      expect(body, file).not.toContain("lastError ?");
    }
  });
});

describe("设备目录写入只走所有者", () => {
  it("扫描错误、焦点、运行时状态不再各写一次", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const emptyError = 'setState("lastError", "")';
    const focusWrite = 'setState("focusSerial", serial)';
    const statusUpsert = 'setState("statuses", statusSerial(status), status)';
    const statusClear = 'setState("statuses", serial, undefined!)';
    for (const file of productionSources(root)) {
      let body = readFileSync(file, "utf8");
      if (file.endsWith("device-store.ts")) {
        body = body.replace(emptyError, "").replace(focusWrite, "").replace(statusUpsert, "").replace(statusClear, "");
      }
      expect(body, file).not.toContain(emptyError);
      expect(body, file).not.toContain(focusWrite);
      expect(body, file).not.toContain('setState("statuses"');
    }
  });
});

describe("缺模块勾选列表只判一次", () => {
  it("三处读取走同一空数组", () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), "device-store.ts");
    const body = readFileSync(file, "utf8");
    const needle = "?? " + "[]";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("moduleSelection(id).filter");
    expect(body).toContain("const implicit = moduleSelection(moduleId)");
    expect(body).toContain("moduleSelection(moduleId),");
  });
});
