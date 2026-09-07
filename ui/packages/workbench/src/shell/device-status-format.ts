/**
 * 设备栏运行时次行 / title 文案（壳展示层）。
 * 不属于 @yohu/api 契约门面：没有 domain testdata 孪生，也不应出现在 IPC 包。
 */

import type { DeviceStatus } from "@yohu/api";

/** 设备栏次行：Android 版本与电量。无数据时为空串。 */
export function formatDeviceStatusMeta(status: DeviceStatus | undefined): string {
  if (!status) return "";
  const parts: string[] = [];
  const release = status.release?.trim();
  if (release) parts.push(`Android ${release}`);
  else if (status.sdk != null) parts.push(`API ${status.sdk}`);
  if (status.battery_pct != null) {
    parts.push(status.charging ? `${status.battery_pct}% 充电` : `${status.battery_pct}%`);
  }
  return parts.join(" · ");
}

/** 设备卡片 title 附加：次行 + 深浅色/亮屏/品牌。 */
export function formatDeviceStatusHint(status: DeviceStatus | undefined): string {
  if (!status) return "";
  const parts: string[] = [];
  const meta = formatDeviceStatusMeta(status);
  if (meta) parts.push(meta);
  if (status.night === true) parts.push("深色");
  else if (status.night === false) parts.push("浅色");
  if (status.screen_on === false) parts.push("息屏");
  else if (status.screen_on === true) parts.push("亮屏");
  const brand = status.brand?.trim();
  if (brand) parts.push(brand);
  return parts.join(" · ");
}
