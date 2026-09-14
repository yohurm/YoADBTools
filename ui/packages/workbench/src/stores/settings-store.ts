/**
 * 设置 store：启动加载全量快照；set 后回写并应用立即生效语义（由 core 负责）。
 * 本 store 是设置的唯一 UI 投影；壳经 DeviceSession.settings 注入模块。
 * 启动读 `system.info`；变更跟 `settings/changed`。无单键 get。
 * `system.info` 同时回填身份与路径目录（关于页 / 标题栏 / 状态栏 / 路径展示）。
 * 外观项（theme/density）在加载与变更后同步到 documentElement（data-theme/data-density）。
 */

import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

import {
  APP_SETTINGS_DEFAULT,
  APP_IDENTITY,
  EMPTY_PATH_CATALOG,
  dialogOpenDirectory,
  dialogOpenFile,
  onSettingsChanged,
  settingsSet,
  systemInfo,
  systemOpenPath,
  YoLog,
} from "@yohu/api";
import type {
  AppIdentity,
  AppPathCatalog,
  AppSettings,
  DialogFilter,
  SettingKey,
  SettingValue,
} from "@yohu/api";
import { setDensity, setTheme } from "@yohu/ui";

import { wireSettingValue } from "./settings-wire";

const EMPTY_RESOLVED = {
  adb_path: "",
  data_root: "",
  export_default_path: "",
};

/** 应用外观设置（主题 + 密度）。 */
function applyAppearance(settings: AppSettings): void {
  setTheme(settings.theme);
  setDensity(settings.density);
}

export function createSettingsStore() {
  const [state, setState] = createStore<AppSettings>({ ...APP_SETTINGS_DEFAULT });
  const [resolved, setResolved] = createStore({ ...EMPTY_RESOLVED });
  const [identity, setIdentity] = createStore<AppIdentity>({ ...APP_IDENTITY });
  const [paths, setPaths] = createStore<AppPathCatalog>({ ...EMPTY_PATH_CATALOG });
  const [os, setOs] = createSignal("");

  async function load(): Promise<void> {
    try {
      const info = await systemInfo();
      if (info.os == null || info.adb_path == null) {
        throw new Error("system.info 缺少 os 或 adb_path");
      }
      setState(info.settings);
      setIdentity(info.identity);
      setPaths(info.paths);
      setOs(info.os);
      setResolved({
        adb_path: info.adb_path,
        data_root: info.paths.data_root,
        export_default_path: info.paths.exports_dir,
      });
      applyAppearance(info.settings);
      if (info.identity.display_name) {
        document.title = info.identity.display_name;
      }
    } catch (e) {
      YoLog.error("settings", "加载失败", String(e));
      console.error("system.info 失败", e);
    }
  }

  async function set(key: SettingKey, value: unknown): Promise<void> {
    try {
      const updated = await settingsSet(key, wireSettingValue(key, value) as SettingValue<SettingKey>);
      setState(updated);
      applyAppearance(updated);
      YoLog.info("settings", "已保存", { key, value });
    } catch (e) {
      YoLog.error("settings", "保存失败", { key, error: String(e) });
      throw e;
    }
  }

  async function browseFile(
    key: SettingKey,
    title: string,
    filters?: DialogFilter[],
  ): Promise<string | null> {
    const selected = await dialogOpenFile({ title, filters });
    if (typeof selected !== "string") return null;
    await set(key, selected);
    return selected;
  }

  async function browseDirectory(key: SettingKey, title: string): Promise<string | null> {
    const selected = await dialogOpenDirectory({ title });
    if (typeof selected !== "string") return null;
    await set(key, selected);
    return selected;
  }

  function browseAdbPath(): Promise<string | null> {
    const windows = os() === "windows";
    return browseFile(
      "adb_path",
      windows ? "选择 adb.exe" : "选择 adb",
      windows ? [{ name: "adb 可执行文件", extensions: ["exe"] }] : [],
    );
  }

  function browseDataRoot(): Promise<string | null> {
    return browseDirectory("data_root", "选择数据目录");
  }

  function browseExportPath(): Promise<string | null> {
    return browseDirectory("export_default_path", "选择日志导出目录");
  }

  async function openLogsDir(): Promise<void> {
    await systemOpenPath(paths.logs_dir);
  }

  // 模块也可 settings.set（IPC）；壳投影必须跟 settings/changed，禁止出现双份真相。
  void onSettingsChanged((e) => {
    setState(e.settings);
    applyAppearance(e.settings);
  });

  return {
    state,
    resolved,
    identity,
    paths,
    os,
    load,
    set,
    browseAdbPath,
    browseDataRoot,
    browseExportPath,
    openLogsDir,
  };
}

export type SettingsStoreApi = ReturnType<typeof createSettingsStore>;
