/**
 * 日志清单显示列目录。
 * 身份在 wire（settings.log_display_columns）；画法在模块 editor/format。
 * 设置项与清单标题栏只认本表，禁止 SettingsForm / Formatter 各写一份 key / 文案。
 * 消息列始终在，不进开关。
 */

import type { LogDisplayColumns } from "./types";

export type LogDisplayColumnKey = keyof LogDisplayColumns;

export const LOG_DISPLAY_COLUMN_CATALOG: readonly {
  key: LogDisplayColumnKey;
  label: string;
}[] = [
  { key: "ts", label: "时间" },
  { key: "uid", label: "UID" },
  { key: "pid", label: "PID" },
  { key: "tid", label: "TID" },
  { key: "tag", label: "Tag" },
  { key: "app", label: "应用" },
  { key: "level", label: "级别" },
];

export const LOG_MESSAGE_COLUMN = { key: "msg", label: "消息" } as const;
