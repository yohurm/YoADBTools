/**
 * 设备展示名与选中切片（与 yohu-domain `device_display_name` / `lookup_selected_devices` 对齐）。
 * 页眉 / 设备栏 / 选择器禁止再写 `model ?? serial`。
 * 「Android {版本}」「API {sdk}」两句在这里。设备栏只出其一，日志状态行两者都出。
 */

import type { DeviceInfo, DeviceState } from "./types";

function deviceModelText(device: Pick<DeviceInfo, "model">): string {
  return device.model?.trim() ?? "";
}

/** 型号去空白后非空。展示名回退和下拉「无名」都认这一把。 */
export function deviceHasModel(device: Pick<DeviceInfo, "model">): boolean {
  return deviceModelText(device).length > 0;
}

/** 人读设备名：有型号用之，否则 serial。 */
export function deviceDisplayName(device: Pick<DeviceInfo, "serial" | "model">): string {
  return deviceHasModel(device) ? deviceModelText(device) : device.serial;
}

/** 与领域 `DEVICE_UNSELECTED` 同一句。空面板标题。命令边界「未选择在线设备」不是这一句。 */
export const DEVICE_UNSELECTED = "未选择设备";

/** 有序列号才能对这台设备做操作。没有就带回空面板那一句。 */
export function selectedSerial(
  serial: string | null | undefined,
): { ok: true; serial: string } | { ok: false; reason: typeof DEVICE_UNSELECTED } {
  if (!serial) return { ok: false, reason: DEVICE_UNSELECTED };
  return { ok: true, serial };
}

/** 与 `yohu-domain::device_is_online` 相同：只有 online 算在线。 */
export function deviceIsOnline(state: DeviceState): boolean {
  return state === "online";
}

/** 与 `yohu-domain::device_is_unauthorized` 相同。徽章和设备栏提示共用。 */
export function deviceIsUnauthorized(state: DeviceState): boolean {
  return state === "unauthorized";
}

/** 设备界面深浅色。设备栏提示与投屏按钮共用；不是工作台主题。 */
export function deviceNightWord(night: boolean): string {
  return night ? "深色" : "浅色";
}

export function androidReleaseLabel(release: string): string {
  return `Android ${release}`;
}

export function androidApiLabel(sdk: number): string {
  return `API ${sdk}`;
}

/** 按 serials 顺序从目录取出设备（缺条跳过，保序）。 */
export function lookupSelectedDevices(
  serials: readonly string[],
  catalog: readonly DeviceInfo[],
): DeviceInfo[] {
  const out: DeviceInfo[] = [];
  for (const serial of serials) {
    const device = catalog.find((d) => d.serial === serial);
    if (device) out.push(device);
  }
  return out;
}
