/**
 * 设置默认快照（与 yohu-protocol AppSettings::default 对齐）。
 * 运行时仍以 system.info 为准；本对象只作首屏兜底，由 testdata 契约锁死。
 */

import { LOG_COLOR_SCHEME_DEFAULT } from "./log-color-scheme";
import { LOG_LINE_LAYOUT_DEFAULT } from "./log-line-layout";
import type { AppSettings } from "./types";

export const APP_SETTINGS_DEFAULT: AppSettings = {
  adb_path: "",
  data_root: "",
  devices_auto_refresh: true,
  buffer_capacity: 10000,
  clear_device_on_start: true,
  theme: "system",
  density: "comfortable",
  export_default_path: "",
  export_ask_every_time: true,
  log_display_columns: {
    ts: true,
    uid: false,
    pid: true,
    tid: false,
    level: true,
    tag: true,
  },
  log_time_format: "datetime_millis",
  log_color_scheme: LOG_COLOR_SCHEME_DEFAULT,
  log_line_layout: LOG_LINE_LAYOUT_DEFAULT,
  mirror_max_size: 0,
  mirror_video_bit_rate: 16_000_000,
  mirror_max_fps: 0,
  mirror_protocol: "usb",
  mirror_force_forward: false,
  terminal_prepend_adb: false,
  files_drop_into_folder: false,
  terminal_time_format: "time_millis",
};
