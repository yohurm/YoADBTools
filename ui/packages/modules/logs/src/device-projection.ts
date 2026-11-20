/**
 * 设备桶投影：世代 / 溢出 / 进程索引 / 已安装包名。
 * 模型与读写都在此单源；workspace / capture 只调用，View 只经 store 选择器消费。
 *
 * 世代写入只有两个出口：
 * - `raiseDeviceGen`：只升不减。事件对账、status 对账、start 结果都走它，禁止第二条决策路径。
 * - `resetDeviceGen`：掉线归零（唯一归零点）。
 */

import type { SetStoreFunction } from "solid-js/store";
import { emptyBinding, rebindPids, type PidBinding, type ProcessEntry } from "@yohu/api";

import { scopeIsPackage } from "./filter";
import type { DeviceUiState, LogUiState } from "./log-model";
import { sessionCaptureIsLive } from "./session-chrome";
import { sessionOffSerial } from "./session-lifecycle";

export function emptyDevice(): DeviceUiState {
  return {
    generation: 0,
    overflowed: false,
    processEntries: [],
    indexDegraded: false,
    packages: [],
    packagesDegraded: false,
  };
}

export function deviceSlice(state: LogUiState, serial: string | null | undefined): DeviceUiState {
  if (!serial) return emptyDevice();
  return state.devices[serial] ?? emptyDevice();
}

export function ensureDevice(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  serial: string,
): void {
  if (state.devices[serial]) return;
  setState("devices", serial, emptyDevice());
}

export function processIndexOf(state: LogUiState, serial: string | null): readonly ProcessEntry[] {
  return deviceSlice(state, serial).processEntries;
}

/** 设备进程名按 pid 收成 Formatter 用的 AppNameMap。View 不再自行拼 Record。 */
export function appNamesOf(state: LogUiState, serial: string | null): Record<number, string> {
  const names: Record<number, string> = {};
  for (const entry of processIndexOf(state, serial)) {
    names[entry.pid] = entry.name;
  }
  return names;
}

/**
 * 世代唯一写入原语：只升不减。返回是否真的抬高。
 * 迟到旧世代（含 `status` 回读、`processIndex` 快照）一律不写。
 */
export function raiseDeviceGen(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  serial: string,
  generation: number,
): boolean {
  const current = deviceSlice(state, serial).generation;
  if (generation <= current) return false;
  ensureDevice(state, setState, serial);
  setState("devices", serial, "generation", generation);
  return true;
}

/** 掉线归零。唯一允许把世代写小的转移。 */
export function resetDeviceGen(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  serial: string,
): void {
  ensureDevice(state, setState, serial);
  setState("devices", serial, "generation", 0);
}

export function setOverflowed(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  serial: string,
  overflowed: boolean,
): void {
  ensureDevice(state, setState, serial);
  setState("devices", serial, "overflowed", overflowed);
}

export function setProcessIndex(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  serial: string,
  entries: ProcessEntry[],
  degraded: boolean,
): void {
  ensureDevice(state, setState, serial);
  setState("devices", serial, { processEntries: entries, indexDegraded: degraded });
}

export function setPackages(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  serial: string,
  packages: string[],
  degraded: boolean,
): void {
  ensureDevice(state, setState, serial);
  setState("devices", serial, { packages, packagesDegraded: degraded });
}

function writeBinding(
  setState: SetStoreFunction<LogUiState>,
  idx: number,
  binding: PidBinding,
): void {
  setState("sessions", idx, { binding });
}

/** 包名窗口按该设备进程索引重绑 PID；采集中的窗口补页由 catchUpSession 交回 panel 层。 */
export function bindPackageSessions(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  serial: string,
  entries: readonly ProcessEntry[] | undefined,
  catchUpSession: (id: number) => void,
): void {
  const index = entries ?? processIndexOf(state, serial);
  state.sessions.forEach((session, idx) => {
    if (!scopeIsPackage(session.scope)) return;
    if (sessionOffSerial(session, serial)) return;
    const binding = rebindPids(session.binding, index, session.scope.pkg, session.scope.includeChild);
    writeBinding(setState, idx, binding);
    if (sessionCaptureIsLive(session) && !session.paused) {
      catchUpSession(session.id);
    }
  });
}

/** 尚未绑定设备的窗口跟随左侧焦点。 */
export function assignDefaultSerial(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  serial: string | null,
): void {
  state.sessions.forEach((session, idx) => {
    if (session.serial === null) {
      setState("sessions", idx, { serial });
    }
  });
}

/** 过滤变更后按本窗口设备的进程索引重绑 PID。scope 切走时清空绑定。 */
export function rebindIfPackage(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  idx: number,
): void {
  const session = state.sessions[idx];
  if (!session) return;
  if (!scopeIsPackage(session.scope)) {
    // scope 已切走：历史 PID 集不再参与匹配，绑定必须清掉（否则 pidSet 残留第二份）。
    if (session.binding.current.length === 0 && session.binding.history.length === 0) return;
    writeBinding(setState, idx, emptyBinding());
    return;
  }
  const binding = rebindPids(
    session.binding,
    processIndexOf(state, session.serial),
    session.scope.pkg,
    session.scope.includeChild,
  );
  writeBinding(setState, idx, binding);
}
