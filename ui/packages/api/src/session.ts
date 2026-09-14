/**
 * 壳注入到模块视图的会话（模块不得 import 壳 store）。
 * 设备与设置走同一条链：壳 store 投影 → AppLayout 注入 → 模块 View。
 * 不是 wire；与 yohu-protocol 无孪生。
 */

import type { AppSettings, DeviceInfo, DeviceStatus } from "./types";

export interface DeviceSession {
  /** 全局焦点（日志新窗口默认设备；与 selectedSerials 可能不同） */
  focusSerial: string | null;
  /** 当前模块解析后的执行目标（仅在线）。模块禁止再扫全部设备。 */
  selectedSerials: string[];
  /** 执行目标在目录中的切片（与 selectedSerials 同序）。页眉 / 选择器只读此切片。 */
  selectedDevices: DeviceInfo[];
  /** 页眉展示名（壳从 selectedDevices 计算）；无选中为 null。模块禁止自拼 serial。 */
  selectedLabel: string | null;
  /** 设备目录快照（与壳设备栏同一源） */
  devices: DeviceInfo[];
  /** 在线设备运行时状态（与壳设备栏同一 `device/status` 源；按 serial） */
  deviceStatuses: Record<string, DeviceStatus>;
  /** 应用设置快照（与设置页同一 settingsStore 投影） */
  settings: AppSettings;
}
