/**
 * 设备栏运行时次行 / title 文案（壳展示层）。
 * Android / API 两句在 `@yohu/api`。本文件决定栏上有版本就不写 API，并拼电量与亮屏。
 */

import { androidApiLabel, androidReleaseLabel, deviceIsUnauthorized, deviceNightWord, type DeviceState, type DeviceStatus } from "@yohu/api";

/** 设备栏未授权徽章与提示共用这一句。 */
export const DEVICE_UNAUTHORIZED_LABEL = "未授权";

function joinDot(parts: string[]): string {
  return parts.join(" · ");
}

function statusAbsent(status: DeviceStatus | undefined): status is undefined {
  return !status;
}

function blankStatus() {
  return "" as const;
}

function blankParts(): string[] {
  return [];
}

function batteryPct(status: DeviceStatus) {
  return status.battery_pct;
}

function nightValue(status: DeviceStatus) {
  return status.night;
}

function screenOn(status: DeviceStatus) {
  return status.screen_on;
}

/** 设备栏次行：Android 版本与电量。无数据时为空串。 */
export function formatDeviceStatusMeta(status: DeviceStatus | undefined): string {
  if (statusAbsent(status)) return blankStatus();
  const parts = blankParts();
  const release = status.release?.trim();
  if (release) parts.push(androidReleaseLabel(release));
  else if (status.sdk != null) parts.push(androidApiLabel(status.sdk));
  const battery = batteryPct(status);
  if (battery != null) {
    parts.push(status.charging ? `${battery}% 充电` : `${battery}%`);
  }
  return joinDot(parts);
}

/** 图标轨气泡 / 无障碍名：型号 · 串号 · 未授权 · 运行时提示。 */
export function formatDeviceRailTip(input: {
  name: string;
  serial: string;
  state: DeviceState;
  hint?: string;
}): string {
  const parts = [input.name, input.serial];
  if (deviceIsUnauthorized(input.state)) parts.push(DEVICE_UNAUTHORIZED_LABEL);
  const hint = input.hint?.trim();
  if (hint) parts.push(hint);
  return joinDot(parts);
}

/** 设备卡片 title 附加：次行 + 深浅色/亮屏/品牌。 */
export function formatDeviceStatusHint(status: DeviceStatus | undefined): string {
  if (statusAbsent(status)) return blankStatus();
  const parts = blankParts();
  const meta = formatDeviceStatusMeta(status);
  if (meta) parts.push(meta);
  const night = nightValue(status);
  if (night != null) parts.push(deviceNightWord(night));
  if (screenOn(status) === false) parts.push("息屏");
  else if (screenOn(status) === true) parts.push("亮屏");
  const brand = status.brand?.trim();
  if (brand) parts.push(brand);
  return joinDot(parts);
}
