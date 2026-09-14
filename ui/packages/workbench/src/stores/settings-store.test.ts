/**
 * 设置 store：契约字段直接写入；缺 os / adb_path 走 load catch，首屏默认快照仍成立。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  systemInfo: vi.fn(),
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  return {
    ...actual,
    systemInfo: (...a: unknown[]) => mocks.systemInfo(...a),
    onSettingsChanged: vi.fn(),
  };
});

import { APP_IDENTITY, APP_SETTINGS_DEFAULT, EMPTY_PATH_CATALOG, YoLog } from "@yohu/api";
import type { SystemInfo } from "@yohu/api";

import { createSettingsStore } from "./settings-store";

const ADB_PATH = "C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\data\\tools\\adb\\adb.exe";
const DATA_ROOT = "C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\data";
const EXPORTS_DIR = "C:\\Users\\me\\AppData\\Local\\YohuAdbTools\\data\\modules\\log-analyzer\\exports";

function completeInfo(overrides: Partial<SystemInfo> = {}): SystemInfo {
  return {
    identity: { ...APP_IDENTITY, version: "0.1.0" },
    paths: { ...EMPTY_PATH_CATALOG, data_root: DATA_ROOT, exports_dir: EXPORTS_DIR },
    adb_path: ADB_PATH,
    settings: { ...APP_SETTINGS_DEFAULT, theme: "light" },
    os: "windows",
    ...overrides,
  };
}

describe("settingsStore.load", () => {
  beforeEach(() => {
    mocks.systemInfo.mockReset();
    mocks.systemInfo.mockResolvedValue(completeInfo());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("契约字段直接写入 os 与 resolved.adb_path", async () => {
    const store = createSettingsStore();
    await store.load();
    expect(store.os()).toBe("windows");
    expect(store.resolved.adb_path).toBe(ADB_PATH);
    expect(store.resolved.data_root).toBe(DATA_ROOT);
    expect(store.resolved.export_default_path).toBe(EXPORTS_DIR);
  });

  it("adb_path 空串写入 resolved，不算缺字段", async () => {
    mocks.systemInfo.mockResolvedValue(completeInfo({ adb_path: "" }));
    const store = createSettingsStore();
    await store.load();
    expect(store.os()).toBe("windows");
    expect(store.resolved.adb_path).toBe("");
  });

  it.each([
    { field: "os", patch: { os: undefined } },
    { field: "adb_path", patch: { adb_path: undefined } },
    { field: "os", patch: { os: null } },
    { field: "adb_path", patch: { adb_path: null } },
  ])("缺 $field 时 load 失败并保留首屏默认快照", async ({ patch }) => {
    mocks.systemInfo.mockResolvedValue({
      ...completeInfo(),
      ...patch,
    } as unknown as SystemInfo);
    const error = vi.spyOn(YoLog, "error");
    const store = createSettingsStore();
    await store.load();
    expect(store.os()).toBe("");
    expect(store.resolved.adb_path).toBe("");
    expect(store.resolved.data_root).toBe("");
    expect(store.state).toEqual(APP_SETTINGS_DEFAULT);
    expect(store.identity).toEqual(APP_IDENTITY);
    expect(store.paths).toEqual(EMPTY_PATH_CATALOG);
    expect(error).toHaveBeenCalledWith("settings", "加载失败", expect.stringContaining("os 或 adb_path"));
  });
});
