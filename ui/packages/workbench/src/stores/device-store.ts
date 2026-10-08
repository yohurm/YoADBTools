/**
 * 设备 store：UI 投影最近一次目录快照 + 运行时状态（焦点/每模块勾选是选择会话，不是第二份目录）。
 * 写目录只经 `device.refresh`；读目录经 `device.list` 与 `devices/changed`。
 * 运行时状态只经 `device.status` 与 `device/status`（模块禁止自己轮询 adb）。
 * 卡片先出目录，Android 版本/电量随后经 `device/status` 补上，不必等整包 dumpsys。
 */

import { createStore } from "solid-js/store";

import {
  deviceList,
  deviceRefresh,
  deviceStatus,
  errorText,
  lookupSelectedDevices,
  deviceIsOnline,
  reconcileFocus,
  resolveTargetSerials,
  selectionModeIsMulti,
  onDeviceOffline,
  onDeviceStatus,
  onDevicesChanged,
  systemInfo,
  YoLog,
} from "@yohu/api";
import type { DeviceInfo, DeviceStatus } from "@yohu/api";

import type { SelectionMode } from "../registry";

export interface DeviceStore {
  devices: DeviceInfo[];
  /** 在线设备运行时快照（serial → DeviceStatus） */
  statuses: Record<string, DeviceStatus>;
  refreshing: boolean;
  /** 全局焦点 serial（SingleRequired 模块跟随） */
  focusSerial: string | null;
  /** 每模块勾选（仅 MultiOptional 写入；解析时再 ∩ 在线） */
  selectedByModule: Record<string, string[]>;
  statusText: string;
  /** 最近一次失败明细（含 adb 路径诊断） */
  lastError: string;
}

export interface SelectDeviceOpts {
  moduleId?: string;
  mode?: SelectionMode;
  /** Ctrl/Meta：在 MultiOptional 下加减选 */
  additive?: boolean;
}

function listedCount(devices: readonly DeviceInfo[]): number {
  return devices.length;
}

function listedSerials(devices: readonly DeviceInfo[]): string[] {
  return devices.map((d) => d.serial);
}

/** 目录快照里一台都没有。在线台数、选中页眉另计。 */
export function deviceCatalogIsEmpty(devices: readonly DeviceInfo[]): boolean {
  return listedCount(devices) === 0;
}

/** 最近一次扫描留下了错误明细。 */
export function deviceScanHasError(lastError: string): boolean {
  return lastError.length > 0;
}

export function createDeviceStore() {
  const [state, setState] = createStore<DeviceStore>({
    devices: [],
    statuses: {},
    refreshing: false,
    focusSerial: null,
    selectedByModule: {},
    statusText: "未扫描",
    lastError: "",
  });

  function catalog(): DeviceInfo[] {
    return state.devices;
  }

  function focus(): string | null {
    return state.focusSerial;
  }

  function selectionMap(): Record<string, string[]> {
    return state.selectedByModule;
  }

  function caughtText(e: unknown): string {
    return errorText(e);
  }

  function deviceChannel() {
    return "device" as const;
  }

  function nowMs(): number {
    return performance.now();
  }

  function onlineCount(online: readonly string[]): number {
    return online.length;
  }

  function statusSerial(status: DeviceStatus): string {
    return status.serial;
  }

  function additivePick(opts?: SelectDeviceOpts): boolean | undefined {
    return opts?.additive;
  }

  const moduleSelection = (id: string): string[] => selectionMap()[id] ?? [];

  function onlineSerials(devices: readonly DeviceInfo[]): string[] {
    return devices.filter((d) => deviceIsOnline(d.state)).map((d) => d.serial);
  }

  function applyStatus(status: DeviceStatus): void {
    setState("statuses", statusSerial(status), status);
  }

  function clearStatus(serial: string): void {
    setState("statuses", serial, undefined!);
  }

  function pruneStatuses(online: Set<string>): void {
    for (const serial of Object.keys(state.statuses)) {
      if (!online.has(serial)) clearStatus(serial);
    }
  }

  function applyDevices(devices: DeviceInfo[]): void {
    setState("lastError", "");
    setState("devices", devices);
    const online = onlineSerials(devices);
    setState("statusText", onlineCount(online) > 0 ? `在线 ${onlineCount(online)} 台` : "无在线设备");
    pruneSelections(new Set(listedSerials(devices)));
    pruneStatuses(new Set(online));
    setFocus(reconcileFocus(focus(), online));
  }

  /** `device/status` 可丢；对账走缓存快照（ADR-v6-025），不打 dumpsys。 */
  async function pullStatuses(): Promise<void> {
    try {
      const statuses = await deviceStatus();
      const online = new Set(onlineSerials(catalog()));
      for (const status of statuses) {
        if (online.has(statusSerial(status))) applyStatus(status);
      }
    } catch (e) {
      YoLog.warn(deviceChannel(), `读取运行时状态失败 ${caughtText(e)}`);
    }
  }

  async function awaitStatuses(): Promise<void> {
    await pullStatuses();
  }

  /** 读 core 目录快照，不跑 adb。启动扫描走 `refresh()`。 */
  async function load(): Promise<void> {
    try {
      const devices = await deviceList();
      applyDevices(devices);
      if (!deviceCatalogIsEmpty(devices)) {
        YoLog.info(deviceChannel(), `读目录 ${listedCount(devices)} 台`, listedSerials(devices));
      }
    } catch (e) {
      const detail = caughtText(e);
      setState("lastError", detail);
      YoLog.error(deviceChannel(), `读取目录失败 ${detail}`);
      console.error("device.list 失败", e);
    }
    await awaitStatuses();
  }

  async function refresh(): Promise<void> {
    setState("refreshing", true);
    if (deviceCatalogIsEmpty(catalog())) {
      setState("statusText", "扫描中…");
    }
    const t0 = nowMs();
    try {
      const devices = await deviceRefresh();
      applyDevices(devices);
      await awaitStatuses();
      YoLog.info(
        deviceChannel(),
        `扫描完成 ${listedCount(devices)} 台 ${Math.round(nowMs() - t0)}ms`,
        listedSerials(devices),
      );
    } catch (e) {
      const detail = caughtText(e);
      let adbHint = "";
      try {
        const info = await systemInfo();
        const used = info.adb_path;
        adbHint = used ? `；adb: ${used}` : "；adb 未解析";
      } catch (hintErr) {
        YoLog.warn(deviceChannel(), `读取 adb 路径失败 ${errorText(hintErr)}`);
      }
      setState("lastError", `${detail}${adbHint}`);
      setState("statusText", "设备扫描失败");
      YoLog.error(deviceChannel(), `扫描失败 ${detail}${adbHint}`);
      console.error("device.refresh 失败", e);
    } finally {
      setState("refreshing", false);
    }
  }

  function pruneSelections(known: Set<string>): void {
    const prevIds = Object.keys(selectionMap());
    for (const id of prevIds) {
      const kept = moduleSelection(id).filter((s) => known.has(s));
      setState("selectedByModule", id, kept.length > 0 ? kept : undefined!);
    }
  }

  function setFocus(serial: string | null): void {
    setState("focusSerial", serial);
  }

  /** 设备栏选择：始终更新全局焦点；MultiOptional 才写入模块勾选。 */
  function selectDevice(serial: string, opts?: SelectDeviceOpts): void {
    const previousFocus = focus();
    setFocus(serial);
    const moduleId = opts?.moduleId;
    const mode = opts?.mode;
    if (!moduleId || !selectionModeIsMulti(mode)) return;

    const implicit = moduleSelection(moduleId);
    const current =
      additivePick(opts) && implicit.length === 0 && previousFocus && previousFocus !== serial
        ? [previousFocus]
        : implicit;
    const next = additivePick(opts)
      ? current.includes(serial)
        ? current.filter((s) => s !== serial)
        : [...current, serial]
      : [serial];
    setState("selectedByModule", moduleId, next);
  }

  function selectedSerials(moduleId: string, mode: SelectionMode): string[] {
    return resolveTargetSerials(
      mode,
      focus(),
      moduleSelection(moduleId),
      onlineSerials(catalog()),
    );
  }

  function selectedDevices(moduleId: string, mode: SelectionMode): DeviceInfo[] {
    return lookupSelectedDevices(selectedSerials(moduleId, mode), catalog());
  }

  function refreshNow(): void {
    void refresh();
  }

  function bindIpc(): void {
    void onDevicesChanged((e) => {
      applyDevices(e.devices);
      void pullStatuses();
    });
    void onDeviceOffline((e) => {
      clearStatus(e.serial);
    });
    void onDeviceStatus((e) => {
      applyStatus(e.status);
    });
  }

  return {
    state,
    load,
    refresh,
    refreshNow,
    setFocus,
    selectDevice,
    selectedSerials,
    selectedDevices,
    bindIpc,
    catalog,
    focus,
    caughtText,
    listedCount,
  };
}

export type DeviceStoreApi = ReturnType<typeof createDeviceStore>;
