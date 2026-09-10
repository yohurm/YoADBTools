/**
 * 日志列规格（L1）：可见列、默认宽。
 * 表头轨道不在这里用 px 拼：走 doc.ts `logDocTrackTemplate`（与 formatLogDoc 同一把 ch 尺）。
 * 列宽代数走 YoUI col-model；本文件只留业务默认值。
 */

import { APP_SETTINGS_DEFAULT, type LogDisplayColumns, type LogLine } from "@yohu/api";
import { defaultColWidths } from "@yohu/ui";

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
  ...APP_SETTINGS_DEFAULT.log_display_columns,
};

/** 定宽轨道；消息列吃剩余。默认宽要放下标题列垫 + 六位 PID / 「级别」。 */
export const LOG_COLUMNS: readonly LogColumnSpec[] = [
  { key: "ts", header: "时间", resizeLabel: "调节时间列宽", defaultWidth: 144, minWidth: 72, flex: false },
  { key: "uid", header: "UID", resizeLabel: "调节 UID 列宽", defaultWidth: 80, minWidth: 40, flex: false, align: "end" },
  { key: "pid", header: "PID", resizeLabel: "调节 PID 列宽", defaultWidth: 80, minWidth: 56, flex: false, align: "end" },
  { key: "tid", header: "TID", resizeLabel: "调节 TID 列宽", defaultWidth: 80, minWidth: 56, flex: false, align: "end" },
  { key: "level", header: "级别", resizeLabel: "调节级别列宽", defaultWidth: 64, minWidth: 48, flex: false },
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

/** 字段原文（与表头同序）。不含 pad / 列间空格；清单文档用 formatLogDoc。 */
export function logFieldText(line: LogLine, key: LogColKey): string {
  switch (key) {
    case "ts":
      return line.ts;
    case "uid":
      return line.uid ?? "";
    case "pid":
      return String(line.pid);
    case "tid":
      return String(line.tid);
    case "level":
      return line.level;
    case "tag":
      return line.tag;
    case "msg":
      return line.msg;
  }
}
