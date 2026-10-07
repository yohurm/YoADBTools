/**
 * 设置 store：契约字段直接写入；缺 os / adb_path 走 load catch，首屏默认快照仍成立。
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

import { APP_IDENTITY, APP_SETTINGS_DEFAULT, EMPTY_PATH_CATALOG, dialogPickAccepted, YoLog } from "@yohu/api";
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

  it("创建时就把默认外观写到 documentElement", () => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-pref");
    document.documentElement.removeAttribute("data-density");
    createSettingsStore();
    expect(document.documentElement.getAttribute("data-theme-pref")).toBe("system");
    expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
    expect(["light", "dark"]).toContain(document.documentElement.getAttribute("data-theme"));
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

describe("选择器是否交出路径只判一次", () => {
  it("成功才算交出路径", () => {
    expect(dialogPickAccepted({ ok: true, path: "C:\\adb.exe" })).toBe(true);
    expect(dialogPickAccepted({ ok: false, reason: "cancelled" })).toBe(false);
    expect(dialogPickAccepted({ ok: false, reason: "failed" })).toBe(false);
  });

  it("生产源不再读 pick.ok", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const file of productionSources(root)) {
      let body = readFileSync(file, "utf8");
      if (file.endsWith("settings-store.ts")) {
        body = body.replace("return pick.ok;", "");
      }
      expect(body, file).not.toContain(".ok");
    }
  });
});

describe("对话框选中路径后写入设置只写一次", () => {
  it("commit_pick_once", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "settings-store.ts"), "utf8");
    const needle = "if (!dialogPickAccepted(selected)) return " + "selected;";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("commitPick(");
  });
});

describe("文档外观只经 applyAppearance", () => {
  it("生产源不再直接改主题或密度", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    for (const file of productionSources(root)) {
      let body = readFileSync(file, "utf8");
      if (file.endsWith("settings-store.ts")) {
        body = body.replace('import { setDensity, setTheme } from "@yohu/ui";', "");
        body = body.replace("setTheme(settings.theme);", "");
        body = body.replace("setDensity(settings.density);", "");
      }
      expect(body, file).not.toContain("setTheme");
      expect(body, file).not.toContain("setDensity");
    }
  });
});
