/**
 * 设置 store：启动加载全量快照；set 后回写并应用立即生效语义（由 core 负责）。
 * 本 store 是设置的唯一 UI 投影；壳经 DeviceSession.settings 注入模块。
 * 启动读 `system.info`；变更跟 `settings/changed`。无单键 get。
 * `system.info` 同时回填身份与路径目录（关于页 / 标题栏 / 状态栏 / 路径展示）。
 * 读失败上抛主错误，不把创建时的默认快照当成已加载。
 * 外观项（theme/density）只经 applyAppearance 写入 documentElement：创建时用默认快照，加载与变更后再写。
 */

import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

import {
  APP_SETTINGS_DEFAULT,
  APP_IDENTITY,
  EMPTY_PATH_CATALOG,
  dialogOpenDirectory,
  dialogOpenFile,
  dialogPickAccepted,
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
  DialogPick,
  SettingKey,
  SettingValue,
  SystemInfo,
} from "@yohu/api";
import { setDensity, setTheme } from "@yohu/ui";

import { hostOsIsLinux, hostOsIsMacos, hostOsIsWindows } from "./host-os";
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

function reportedAdb(info: SystemInfo): string {
  return info.adb_path;
}

function reportedSettings(info: SystemInfo): AppSettings {
  return info.settings;
}

function reportedName(info: SystemInfo): string {
  return info.identity.display_name;
}

export function createSettingsStore() {
  const [state, setState] = createStore<AppSettings>({ ...APP_SETTINGS_DEFAULT });
  const [resolved, setResolved] = createStore({ ...EMPTY_RESOLVED });
  const [identity, setIdentity] = createStore<AppIdentity>({ ...APP_IDENTITY });
  const [paths, setPaths] = createStore<AppPathCatalog>({ ...EMPTY_PATH_CATALOG });
  const [os, setOs] = createSignal("");
  applyAppearance(state);

  async function load(): Promise<void> {
    try {
      const info = await systemInfo();
      const adbPath = reportedAdb(info);
      if (info.os == null || adbPath == null) {
        throw new Error("system.info 缺少 os 或 adb_path");
      }
      const loaded = reportedSettings(info);
      setState(loaded);
      setIdentity(info.identity);
      setPaths(info.paths);
      setOs(info.os);
      setResolved({
        adb_path: adbPath,
        data_root: info.paths.data_root,
        export_default_path: info.paths.exports_dir,
      });
      applyAppearance(loaded);
      const name = reportedName(info);
      if (name) {
        document.title = name;
      }
    } catch (e) {
      YoLog.error(settingsChannel(), "加载失败", errorDetail(e));
      console.error("system.info 失败", e);
      throw e;
    }
  }

  async function set(key: SettingKey, value: unknown): Promise<void> {
    try {
      const updated = await settingsSet(key, wireSettingValue(key, value) as SettingValue<SettingKey>);
      setState(updated);
      applyAppearance(updated);
      YoLog.info(settingsChannel(), "已保存", { key, value });
    } catch (e) {
      YoLog.error(settingsChannel(), "保存失败", { key, error: errorDetail(e) });
      throw e;
    }
  }

  async function commitPick(key: SettingKey, selected: DialogPick): Promise<DialogPick> {
    if (!dialogPickAccepted(selected)) return selected;
    await set(key, selected.path);
    return selected;
  }

  async function browseFile(
    key: SettingKey,
    title: string,
    filters?: DialogFilter[],
  ): Promise<DialogPick> {
    const selected = await dialogOpenFile({ title, filters });
    return commitPick(key, selected);
  }

  async function browseDirectory(key: SettingKey, title: string): Promise<DialogPick> {
    const selected = await dialogOpenDirectory({ title });
    return commitPick(key, selected);
  }

  function browseAdbPath(): Promise<DialogPick> {
    const windows = hostOsIsWindows(os());
    return browseFile(
      "adb_path",
      windows ? "选择 adb.exe" : "选择 adb",
      windows ? [{ name: "adb 可执行文件", extensions: ["exe"] }] : [],
    );
  }

  function browseDataRoot(): Promise<DialogPick> {
    return browseDirectory("data_root", "选择数据目录");
  }

  function browseExportPath(): Promise<DialogPick> {
    return browseDirectory("export_default_path", "选择日志导出目录");
  }

  function displayName(): string {
    return identity.display_name;
  }

  function macosHost(): boolean {
    return hostOsIsMacos(os());
  }

  function linuxHost(): boolean {
    return hostOsIsLinux(os());
  }

  function logsDirectory(): string {
    return paths.logs_dir;
  }

  function normalStyle() {
    return "normal" as const;
  }

  function neutralTone() {
    return "neutral" as const;
  }

  function accentTone() {
    return "accent" as const;
  }

  function smSize() {
    return "sm" as const;
  }

  function errorTone() {
    return "error" as const;
  }

  function errorDetail(e: unknown): string {
    return String(e);
  }

  function settingsChannel() {
    return "settings" as const;
  }

  async function openLogsDir(): Promise<void> {
    await systemOpenPath(logsDirectory());
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
    displayName,
    macosHost,
    linuxHost,
    logsDirectory,
    normalStyle,
    neutralTone,
    accentTone,
    smSize,
    errorTone,
    errorDetail,
  };
}

export type SettingsStoreApi = ReturnType<typeof createSettingsStore>;
