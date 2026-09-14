/**
 * 投屏协议常量（与 yohu-protocol::scrcpy / MIRROR_MIN_LAYOUT_PX 对齐）。
 */

/** 官方 scrcpy-server 钉死版本。 */
export const SCRCPY_SERVER_VERSION = "4.1";

/** 投屏可用区最小物理像素。 */
export const MIRROR_MIN_LAYOUT_PX = 64;

/** Android KeyEvent keycode（与 yohu-protocol::android_key 对齐）。 */
export const AndroidKey = {
  Home: 3,
  Back: 4,
  VolumeUp: 24,
  VolumeDown: 25,
  Power: 26,
  AppSwitch: 187,
  BrightnessDown: 220,
  BrightnessUp: 221,
} as const;
