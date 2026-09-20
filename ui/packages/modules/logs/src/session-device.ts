/**
 * 日志窗口状态行：设备名 + Android 版本 + API。
 * 数据来自壳注入的 DeviceSession（目录 + DeviceStatusHub），禁止再拼 serial。
 */

import { deviceDisplayName, type DeviceInfo, type DeviceStatus } from "@yohu/api";

/** 设备短号：长 serial 取末 4 位。Tab 与新建窗共用。 */
export function shortSerial(serial: string | null | undefined): string {
  if (!serial) return "";
  return serial.length > 6 ? serial.slice(-4) : serial;
}

/** 连接方式：usb / usb:* → USB；tcp: / wifi → 无线。 */
export function deviceConnectionLabel(connection: string | null | undefined): string {
  const value = connection?.trim() ?? "";
  if (!value) return "";
  if (value === "usb" || value.startsWith("usb:")) return "USB";
  if (value === "wifi" || value.startsWith("tcp:")) return "无线";
  return value;
}

/** 新建窗设备下拉：型号 · 短号；无名则整串 serial。 */
export function devicePickerLabel(device: DeviceInfo): string {
  const name = deviceDisplayName(device);
  if (name === device.serial) return device.serial;
  const short = shortSerial(device.serial);
  return short ? `${name} · ${short}` : name;
}

/** 下拉次文案：有型号则短号 · 连接；无名则只留连接。 */
export function devicePickerDescription(device: DeviceInfo): string {
  const link = deviceConnectionLabel(device.connection);
  const name = deviceDisplayName(device);
  if (name === device.serial) return link;
  const short = shortSerial(device.serial);
  return [short, link].filter(Boolean).join(" · ");
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
  if (release) parts.push(`Android ${release}`);
  if (status?.sdk != null) parts.push(`API ${status.sdk}`);
  return parts.join(" · ");
}
