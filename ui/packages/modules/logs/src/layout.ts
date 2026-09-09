/**
 * 日志表头铬层列规格。行是文档（formatLogLine），不共用这套 px 轨道。
 * 显示列由设置 `log_display_columns` 裁剪（表头与文档段同一开关）。
 * 列宽代数走 YoUI col-model；本文件只留表头默认值。
 */

import type { LogDisplayColumns } from "@yohu/api";
import { colTrackTemplate, defaultColWidths, setColWidth, type YoColWidths } from "@yohu/ui";

export type LogMetaColKey = keyof LogDisplayColumns;
export type LogColKey = LogMetaColKey | "msg";
export type LogColAlign = "start" | "end" | "center";
export type LogColWidths = Record<LogColKey, number>;

export interface LogColumnSpec {
  key: LogColKey;
  header: string;
  resizeLabel: string;
  defaultWidth: number;
  minWidth: number;
  /** 消息列吃剩余，右缘不挂拖拽条 */
  flex: boolean;
  align?: Exclude<LogColAlign, "start">;
}

export const DEFAULT_LOG_DISPLAY_COLUMNS: LogDisplayColumns = {
  ts: true,
  uid: true,
  pid: true,
  tid: true,
  level: true,
  tag: true,
};

/** 定宽轨道；消息列吃剩余。级别至少能放下表头「级别」。 */
export const LOG_COLUMNS: readonly LogColumnSpec[] = [
  { key: "ts", header: "时间", resizeLabel: "调节时间列宽", defaultWidth: 144, minWidth: 72, flex: false },
  { key: "uid", header: "UID", resizeLabel: "调节 UID 列宽", defaultWidth: 80, minWidth: 40, flex: false },
  { key: "pid", header: "PID", resizeLabel: "调节 PID 列宽", defaultWidth: 48, minWidth: 36, flex: false, align: "end" },
  { key: "tid", header: "TID", resizeLabel: "调节 TID 列宽", defaultWidth: 48, minWidth: 36, flex: false, align: "end" },
  { key: "level", header: "级别", resizeLabel: "调节级别列宽", defaultWidth: 48, minWidth: 36, flex: false, align: "center" },
  { key: "tag", header: "Tag", resizeLabel: "调节 Tag 列宽", defaultWidth: 192, minWidth: 48, flex: false },
  { key: "msg", header: "消息", resizeLabel: "调节消息列宽", defaultWidth: 96, minWidth: 80, flex: true },
];

export function defaultLogColWidths(): LogColWidths {
  return defaultColWidths(LOG_COLUMNS) as LogColWidths;
}

export function visibleLogColumns(display: LogDisplayColumns): LogColumnSpec[] {
  return LOG_COLUMNS.filter((col) => {
    if (col.key === "msg") return true;
    return display[col.key];
  });
}

export function logColTemplate(display: LogDisplayColumns, widths: LogColWidths = defaultLogColWidths()): string {
  return colTrackTemplate(visibleLogColumns(display), widths);
}

export function applyLogColWidth(widths: LogColWidths, key: LogColKey, px: number): LogColWidths {
  const spec = LOG_COLUMNS.find((col) => col.key === key);
  if (!spec) return widths;
  return setColWidth(widths as YoColWidths, spec, px) as LogColWidths;
}
