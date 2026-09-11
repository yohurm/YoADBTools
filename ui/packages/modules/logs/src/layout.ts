/**
 * 日志列规格（L1）：可见列、默认宽、对齐。
 * 表头轨道不在这里用 px 拼：走 doc.ts `logDocTrackTemplate`（与 formatLogDoc 同一把 ch 尺）。
 * 列宽代数走 YoUI col-model；本文件只留业务默认值。
 * 数字列 align=end：表头与文档同一源，禁止 View 漏传、禁止 doc 再写死 pid/tid/uid。
 */

import {
  APP_SETTINGS_DEFAULT,
  DATETIME_DISPLAY_LEN,
  TIME_DISPLAY_LEN,
  clockDisplayLen,
  type LogDisplayColumns,
  type LogLine,
  type TerminalTimeFormat,
} from "@yohu/api";
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

/** 设计尺：1 字段字符 = 8px。默认列宽按内容字符换，不跟 measureChPx 走。 */
export const LOG_CH_PX = 8;

/** 字段载荷字符。时间对齐墙钟；PID/TID 五位；级别仍是一字母。列尺另加表头全角。 */
export const LOG_FIELD_CHARS: Record<LogMetaColKey, number> = {
  ts: DATETIME_DISPLAY_LEN,
  uid: 8,
  pid: 5,
  tid: 5,
  level: 1,
  tag: 10,
};

/** 表头在文档 ch 尺上的宽度。CJK 全角 2ch（等宽「级别」= 4，不是 2）。 */
export function headerLabelChars(header: string): number {
  let n = 0;
  for (const ch of header) {
    n += (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
  }
  return n;
}

/** 列最小/默认字符 = max(字段载荷, 表头全角)。禁止只按一字母把「级别」压成 1ch。 */
export function logSlotChars(key: LogMetaColKey, header: string, timeFormat?: TerminalTimeFormat): number {
  const payload = key === "ts" && timeFormat != null ? clockDisplayLen(timeFormat) : LOG_FIELD_CHARS[key];
  return Math.max(payload, headerLabelChars(header));
}

function fieldPx(chars: number): number {
  return chars * LOG_CH_PX;
}

/** 时间列字段 px：切格式时贴内容宽，与 doc 尺同一公式。 */
export function tsFieldPx(format: TerminalTimeFormat): number {
  return clockDisplayLen(format) * LOG_CH_PX;
}

function metaColPx(key: LogMetaColKey, header: string): number {
  return fieldPx(logSlotChars(key, header));
}

/** 定宽轨道；消息列吃剩余。默认宽对齐 max(字段, 表头)。 */
export const LOG_COLUMNS: readonly LogColumnSpec[] = [
  { key: "ts", header: "时间", resizeLabel: "调节时间列宽", defaultWidth: tsFieldPx(APP_SETTINGS_DEFAULT.log_time_format), minWidth: fieldPx(TIME_DISPLAY_LEN), flex: false },
  { key: "uid", header: "UID", resizeLabel: "调节 UID 列宽", defaultWidth: metaColPx("uid", "UID"), minWidth: metaColPx("uid", "UID"), flex: false, align: "end" },
  { key: "pid", header: "PID", resizeLabel: "调节 PID 列宽", defaultWidth: metaColPx("pid", "PID"), minWidth: metaColPx("pid", "PID"), flex: false, align: "end" },
  { key: "tid", header: "TID", resizeLabel: "调节 TID 列宽", defaultWidth: metaColPx("tid", "TID"), minWidth: metaColPx("tid", "TID"), flex: false, align: "end" },
  { key: "tag", header: "Tag", resizeLabel: "调节 Tag 列宽", defaultWidth: 192, minWidth: metaColPx("tag", "Tag"), flex: false },
  { key: "level", header: "级别", resizeLabel: "调节级别列宽", defaultWidth: metaColPx("level", "级别"), minWidth: metaColPx("level", "级别"), flex: false },
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
