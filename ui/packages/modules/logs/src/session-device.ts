/**
 * 日志窗口状态行：设备名 + Android 版本 + API。
 * 数据来自壳注入的 DeviceSession（目录 + DeviceStatusHub），禁止再拼 serial。
 */

import { androidApiLabel, androidReleaseLabel, deviceConnectionLabel, deviceDisplayName, deviceHasModel, type DeviceInfo, type DeviceStatus } from "@yohu/api";

function deviceShort(device: DeviceInfo): string {
  return shortSerial(device.serial);
}

function joinDot(parts: readonly string[]): string {
  return parts.join(" · ");
}

/** 设备短号：长 serial 取末 4 位。Tab 与新建窗共用。 */
export function shortSerial(serial: string | null | undefined): string {
  if (!serial) return "";
  return serial.length > 6 ? serial.slice(-4) : serial;
}

/** 新建窗设备下拉：型号 · 短号；无名则整串 serial。 */
export function devicePickerLabel(device: DeviceInfo): string {
  const name = deviceDisplayName(device);
  if (!deviceHasModel(device)) return device.serial;
  const short = deviceShort(device);
  return short ? joinDot([name, short]) : name;
}

/** 下拉次文案：有型号则短号 · 连接；无名则只留连接。 */
export function devicePickerDescription(device: DeviceInfo): string {
  const link = deviceConnectionLabel(device.connection);
  if (!deviceHasModel(device)) return link;
  const short = deviceShort(device);
  return joinDot([short, link].filter(Boolean));
}

/** 新建窗 Select 主/次文案。主文案是型号（无名回退 serial）。 */
export function devicePickerFields(device: DeviceInfo): { label: string; description: string } {
  return {
    label: deviceDisplayName(device),
    description: devicePickerDescription(device),
  };
}

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
  if (release) parts.push(androidReleaseLabel(release));
  if (status?.sdk != null) parts.push(androidApiLabel(status.sdk));
  return joinDot(parts);
}
