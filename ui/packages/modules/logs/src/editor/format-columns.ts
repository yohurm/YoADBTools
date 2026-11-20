/**
 * Formatter 列几何：列宽、表头轨道、FormatOptions 与列清单。
 * 对照 AS FormattingOptions.getHeaderWidth()。禁止 import Document / Board / View / store。
 */

import {
  APP_SETTINGS_DEFAULT,
  LOG_LINE_LAYOUT_DEFAULT,
  clockDisplayLen,
  logLineWraps,
  LOG_DISPLAY_COLUMN_CATALOG,
  LOG_MESSAGE_COLUMN,
  type LogDisplayColumns,
  type LogLineLayout,
  type TerminalTimeFormat,
} from "@yohu/api";

export const DEFAULT_CH_PX = 8;

export function timestampWidth(format: TerminalTimeFormat): number {
  return clockDisplayLen(format) + 1;
}

export const PROCESS_PID_WIDTH = 6;
/** PID/TID 数字体宽：列宽留一个尾空格。由 PROCESS_PID_WIDTH 派生。 */
export const PID_BODY_WIDTH = PROCESS_PID_WIDTH - 1;
export const PROCESS_BOTH_WIDTH = 12;

export const TAG_DEFAULT_MAX = 23;
/** 官方 TagFormat.maxLength 对应默认宽（字符数）：maxLength+1。 */
export const TAG_DEFAULT_CHARS = TAG_DEFAULT_MAX + 1;
export const TAG_MIN_LENGTH = 10;
export const TAG_ELLIPSIS = "...";

export const APP_DEFAULT_MAX = 35;
export const APP_MIN_LENGTH = 10;
export const APP_PREFIX_KEEP = 6;
export const APP_FORMAT_WIDTH = APP_DEFAULT_MAX + 1;

export const LEVEL_FORMAT_WIDTH = 4;
/** 级别字母格：`" L "` 三格。由 LEVEL_FORMAT_WIDTH 派生（余 1 个尾空格）。 */
export const LEVEL_LETTER_SPAN = LEVEL_FORMAT_WIDTH - 1;

export const UID_BODY_CHARS = 8;
export const UID_FORMAT_WIDTH = UID_BODY_CHARS + 1;

export type LogMetaColKey = keyof LogDisplayColumns;
export type LogColKey = LogMetaColKey | "msg";
export type ProcessThreadStyle = "off" | "pid" | "tid" | "both";
export type AppNameMap = Readonly<Record<number, string>>;

/** 官方 TagFormat.maxLength 对应的默认像素：TAG_DEFAULT_CHARS 个 ch。px 只在测量后换算。 */
export const TAG_DEFAULT_WIDTH_PX = TAG_DEFAULT_CHARS * DEFAULT_CH_PX;

export const DEFAULT_LOG_DISPLAY_COLUMNS: LogDisplayColumns = {
  ...APP_SETTINGS_DEFAULT.log_display_columns,
};

export const ALL_LOG_DISPLAY_COLUMNS: LogDisplayColumns = {
  ts: true,
  uid: true,
  pid: true,
  tid: true,
  tag: true,
  app: true,
  level: true,
};

export function processThreadStyle(display: LogDisplayColumns): ProcessThreadStyle {
  if (display.pid && display.tid) {
    return "both";
  }
  if (display.pid) {
    return "pid";
  }
  if (display.tid) {
    return "tid";
  }
  return "off";
}

/** PID 与 TID 一起显示。列宽、表头拆分和正文拼接都认这一把。 */
export function processThreadIsBoth(style: ProcessThreadStyle): boolean {
  return style === "both";
}

/** 只显示 PID。 */
export function processThreadIsPid(style: ProcessThreadStyle): boolean {
  return style === "pid";
}

/** 只显示 TID。列键也认这一把。 */
export function processThreadIsTid(style: ProcessThreadStyle): boolean {
  return style === "tid";
}

/** 进程列在文档里的键。BOTH 与只开 PID 都是 pid；只开 TID 才是 tid。表头拆分认这一把。 */
function processColumnKey(style: ProcessThreadStyle): "pid" | "tid" {
  return processThreadIsTid(style) ? "tid" : "pid";
}

/** 进程列关掉。 */
export function processThreadIsOff(style: ProcessThreadStyle): boolean {
  return style === "off";
}

/** 消息列。配色、表头宽度和标题栏都认这一把。 */
export function logFieldIsMessage(kind: LogColKey): kind is "msg" {
  return kind === "msg";
}

/** 级别列。配色和表头可拖性都认这一把。 */
export function logFieldIsLevel(kind: LogColKey): kind is "level" {
  return kind === "level";
}

/** 时间与 uid。两套配色都认这一组。 */
export function logFieldIsClock(kind: LogColKey): boolean {
  return kind === "ts" || kind === "uid";
}

/** 进程、线程与应用名。两套配色都认这一组。 */
export function logFieldIsProcess(kind: LogColKey): boolean {
  return kind === "pid" || kind === "tid" || kind === "app";
}

export type FormatOptions = {
  display: LogDisplayColumns;
  tagWidthPx: number;
  timeFormat: TerminalTimeFormat;
  /**
   * 布局是软换行与视口折行的唯一来源：写入悬挂空格（Formatter）与切行（Board）都派生自它。
   * 缺省 clip。
   */
  layout?: LogLineLayout;
  scheme?: string;
  appNames?: AppNameMap;
  /** 进程索引版本。变化即令已画行失效重排（默认开应用列时名称晚到必须刷新）。 */
  appNamesKey?: string;
  /** 列宽覆盖（ch）。缺省走官方 Format.width()；拖宽只加不减官方下限。 */
  colChars?: Partial<Record<LogMetaColKey, number>>;
};

export type FormatColumn = {
  key: LogColKey;
  width: number | null;
};

export type LogHeaderColumn = {
  key: LogColKey;
  label: string;
  width: number | null;
  resizable: boolean;
};

/** 布局缺省 clip。Formatter 写悬挂空格与表头轨道都认这一把。 */
export function formatLayout(options: FormatOptions): LogLineLayout {
  return options.layout ?? LOG_LINE_LAYOUT_DEFAULT;
}

/** 软换行开。格式化与表头轨道共用同一派生，禁止第二处判 layout。 */
export function formatWraps(options: FormatOptions): boolean {
  return logLineWraps(formatLayout(options));
}

export function defaultFormatOptions(display: LogDisplayColumns, scheme?: string): FormatOptions {
  return {
    display,
    tagWidthPx: TAG_DEFAULT_WIDTH_PX,
    timeFormat: APP_SETTINGS_DEFAULT.log_time_format,
    layout: LOG_LINE_LAYOUT_DEFAULT,
    scheme,
  };
}

function bit(value: boolean): number {
  return Number(value);
}

/** 进程索引版本：pid→name 摘要。空表返回 ""，供格式键判断已画行是否失效。 */
export function appNamesRevision(names: AppNameMap | undefined): string {
  if (!names) {
    return "";
  }
  return Object.keys(names)
    .map(Number)
    .sort((a, b) => a - b)
    .map((pid) => `${pid}:${names[pid]}`)
    .join(",");
}

/**
 * 格式键：只含影响**文本内容**的选项。
 * 不含 colChars（列宽是布局瞬态，拖宽不得触发全表重排；提交由 Document 的布局键单独判定）。
 * 含 appNamesKey（进程索引版本，晚到的名称必须使已画行失效）。
 */
export function formatOptionsKey(options: FormatOptions): string {
  const d = options.display;
  return [
    options.timeFormat,
    options.scheme ?? "",
    formatLayout(options),
    bit(d.ts),
    bit(d.uid),
    bit(d.pid),
    bit(d.tid),
    bit(d.tag),
    bit(d.app),
    bit(d.level),
    options.tagWidthPx,
    options.appNamesKey ?? "",
  ].join("|");
}

/** 布局键：列宽覆盖。与格式键分家：只有拖动提交时才变，Document 据此重排一次。 */
export function formatColCharsKey(options: FormatOptions): string {
  return JSON.stringify(options.colChars ?? {});
}

function fieldChars(px: number, min: number): number {
  return Math.max(min, Math.floor(px / DEFAULT_CH_PX));
}

export function tagMaxLength(options: FormatOptions): number {
  return Math.max(TAG_MIN_LENGTH, fieldChars(options.tagWidthPx, TAG_MIN_LENGTH + 1) - 1);
}

export function tagFormatWidth(options: FormatOptions): number {
  const override = options.colChars?.tag;
  if (typeof override === "number" && override > 0) {
    return Math.max(TAG_MIN_LENGTH + 1, override);
  }
  return tagMaxLength(options) + 1;
}

export function minColChars(key: LogMetaColKey, options: FormatOptions): number {
  if (key === "ts") {
    return timestampWidth(options.timeFormat);
  }
  if (key === "uid") {
    return UID_FORMAT_WIDTH;
  }
  if (key === "pid" || key === "tid") {
    return PROCESS_PID_WIDTH;
  }
  if (key === "tag") {
    return TAG_MIN_LENGTH + 1;
  }
  if (key === "app") {
    return APP_MIN_LENGTH + 1;
  }
  return LEVEL_FORMAT_WIDTH;
}

export function colCharsOf(options: FormatOptions, key: LogMetaColKey, fallback: number): number {
  const override = options.colChars?.[key];
  if (typeof override !== "number" || !(override > 0)) {
    return fallback;
  }
  return Math.max(minColChars(key, options), override);
}

export function processColChars(options: FormatOptions, key: "pid" | "tid"): number {
  return colCharsOf(options, key, PROCESS_PID_WIDTH);
}

export function metaColChars(options: FormatOptions, key: "ts" | "uid" | "app"): number {
  const fallback =
    key === "ts" ? timestampWidth(options.timeFormat)
    : key === "uid" ? UID_FORMAT_WIDTH
    : APP_FORMAT_WIDTH;
  return colCharsOf(options, key, fallback);
}

export function logFieldLabel(key: LogColKey): string {
  if (key === LOG_MESSAGE_COLUMN.key) {
    return LOG_MESSAGE_COLUMN.label;
  }
  return LOG_DISPLAY_COLUMN_CATALOG.find((item) => item.key === key)?.label ?? key;
}

function resizableHeader(key: "pid" | "tid", width: number): LogHeaderColumn {
  return { key, label: logFieldLabel(key), width, resizable: true };
}

/** 标题栏列：与文档 Format 同尺；PID+TID 开时拆成两段，对应内容 `pid-tid`。 */
export function headerColumns(options: FormatOptions): LogHeaderColumn[] {
  const process = processThreadStyle(options.display);
  const cols: LogHeaderColumn[] = [];
  for (const col of formatColumns(options)) {
    if (processThreadIsBoth(process) && col.key === processColumnKey(process)) {
      const pidWidth = processColChars(options, "pid");
      const tidWidth = processColChars(options, "tid");
      cols.push(resizableHeader("pid", pidWidth));
      cols.push(resizableHeader("tid", tidWidth));
      continue;
    }
    cols.push({
      key: col.key,
      label: logFieldLabel(col.key),
      width: col.width,
      resizable: !logFieldIsMessage(col.key) && !logFieldIsLevel(col.key),
    });
  }
  return cols;
}

/** 非正探针回落默认尺。测量失败和列像素都认这一把。 */
export function logChUnit(chPx: number): number {
  return chPx > 0 ? chPx : DEFAULT_CH_PX;
}

/** 列宽 ch → px，至少 1。轨道和拖条都认这一把。 */
export function logColPx(chars: number, chPx: number): number {
  return Math.max(1, Math.round(chars * logChUnit(chPx)));
}

/** 表头轨道。px 跟 measureChPx 同一把尺；wrap 时消息吃剩余；clip 时跟文档自然宽横滑。 */
export function logDocTrackTemplate(options: FormatOptions, chPx = DEFAULT_CH_PX): string {
  return headerColumns(options)
    .map((col) => {
      if (col.width == null) {
        return formatWraps(options) ? "minmax(0, 1fr)" : "max-content";
      }
      return `${logColPx(col.width, chPx)}px`;
    })
    .join(" ");
}

/** 按 LogDisplayColumns 列出 Format 字段；PID+TID 合成一条 ProcessThread。 */
export function formatColumns(options: FormatOptions): FormatColumn[] {
  const display = options.display;
  const cols: FormatColumn[] = [];
  if (display.ts) {
    cols.push({ key: "ts", width: metaColChars(options, "ts") });
  }
  if (display.uid) {
    cols.push({ key: "uid", width: metaColChars(options, "uid") });
  }
  const process = processThreadStyle(display);
  if (!processThreadIsOff(process)) {
    const key = processColumnKey(process);
    const width = processThreadIsBoth(process)
      ? processColChars(options, "pid") + processColChars(options, "tid")
      : processColChars(options, key);
    cols.push({ key, width });
  }
  if (display.tag) {
    cols.push({ key: "tag", width: tagFormatWidth(options) });
  }
  if (display.app) {
    cols.push({ key: "app", width: metaColChars(options, "app") });
  }
  if (display.level) {
    cols.push({ key: "level", width: LEVEL_FORMAT_WIDTH });
  }
  cols.push({ key: "msg", width: null });
  return cols;
}

/** 对照 FormattingOptions.getHeaderWidth()。不含消息。 */
export function headerWidth(options: FormatOptions): number {
  let n = 0;
  for (const col of formatColumns(options)) {
    if (logFieldIsMessage(col.key)) {
      continue;
    }
    n += col.width ?? 0;
  }
  return n;
}
