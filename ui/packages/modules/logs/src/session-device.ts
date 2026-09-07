/**
 * 日志窗口状态行：设备名 + Android 版本 + API。
 * 数据来自壳注入的 DeviceSession（目录 + DeviceStatusHub），禁止再拼 serial。
 */

import { deviceDisplayName, type DeviceInfo, type DeviceStatus } from "@yohu/api";

/** 状态行设备文案。无 serial 为破折号；缺型号回退 serial；缺版本则只出已有段。 */
export function formatSessionDevice(
  serial: string | null | undefined,
  devices: readonly DeviceInfo[],
  statuses: Record<string, DeviceStatus>,
): string {
  if (!serial) return "—";
  const device = devices.find((d) => d.serial === serial);
  const name = device ? deviceDisplayName(device) : serial;
  const status = statuses[serial];
  const parts: string[] = [name];
  const release = status?.release?.trim();
  if (release) parts.push(`Android ${release}`);
  if (status?.sdk != null) parts.push(`API ${status.sdk}`);
  return parts.join(" · ");
}
