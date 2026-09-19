/**
 * Formatter：对照 AS MessageFormatter + FormattingOptions + TextAccumulator。
 * 顺序：Timestamp → Uid（扩展）→ ProcessThread → Tag → AppName → Level → message。
 * Soft-Wrap 关：msg 里的 \\n 换成 \\n + headerWidth 空格，写入文档。
 * Soft-Wrap 开：裸 \\n，续行第 0 列。
 * 禁止表格 1fr、禁止 CSS hang、禁止 import Document / View / store。
 */

import {
  APP_SETTINGS_DEFAULT,
  clockDisplayLen,
  formatLogTs,
  isLogColorScheme,
  LOG_COLOR_SCHEME_DEFAULT,
  parseLevelLetter,
  type LevelLetter,
  type LogColorScheme,
  type LogDisplayColumns,
  type LogLine,
  type TerminalTimeFormat,
} from "@yohu/api";
import { defaultColWidths } from "@yohu/ui";

export const DEFAULT_CH_PX = 8;

export function timestampWidth(format: TerminalTimeFormat): number {
  return clockDisplayLen(format) + 1;
}

export const PROCESS_PID_WIDTH = 6;
export const PROCESS_BOTH_WIDTH = 12;

export const TAG_DEFAULT_MAX = 23;
export const TAG_MIN_LENGTH = 10;
export const TAG_ELLIPSIS = "...";

export const APP_DEFAULT_MAX = 35;
export const APP_MIN_LENGTH = 10;
export const APP_PREFIX_KEEP = 6;
export const APP_FORMAT_WIDTH = APP_DEFAULT_MAX + 1;

export const LEVEL_FORMAT_WIDTH = 4;

export const UID_BODY_CHARS = 8;
export const UID_FORMAT_WIDTH = UID_BODY_CHARS + 1;

export type LogMetaColKey = keyof LogDisplayColumns;
export type LogColKey = LogMetaColKey | "msg";
export type LogColWidths = Record<LogColKey, number>;
export type LogFieldKind = LogColKey;
export type ProcessThreadStyle = "off" | "pid" | "tid" | "both";
export type AppNameMap = Readonly<Record<number, string>>;

export interface LogColumnSpec {
  key: LogColKey;
  header: string;
  resizeLabel: string;
  defaultWidth: number;
  minWidth: number;
  flex: boolean;
  resize?: boolean;
}

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

const LOG_TAG_DEFAULT_CHARS = TAG_DEFAULT_MAX + 1;
const LOG_MSG_DEFAULT_CHARS = 12;
const LOG_MSG_MIN_CHARS = 10;

function fieldPx(chars: number): number {
  return chars * DEFAULT_CH_PX;
}

export const LOG_COLUMNS: readonly LogColumnSpec[] = [
  {
    key: "ts",
    header: "时间",
    resizeLabel: "调节时间列宽",
    defaultWidth: fieldPx(timestampWidth(APP_SETTINGS_DEFAULT.log_time_format)),
    minWidth: fieldPx(timestampWidth("time")),
    flex: false,
    resize: false,
  },
  {
    key: "uid",
    header: "UID",
    resizeLabel: "调节 UID 列宽",
    defaultWidth: fieldPx(UID_FORMAT_WIDTH),
    minWidth: fieldPx(UID_FORMAT_WIDTH),
    flex: false,
    resize: false,
  },
  {
    key: "pid",
    header: "PID",
    resizeLabel: "调节 PID 列宽",
    defaultWidth: fieldPx(PROCESS_PID_WIDTH),
    minWidth: fieldPx(PROCESS_PID_WIDTH),
    flex: false,
    resize: false,
  },
  {
    key: "tid",
    header: "TID",
    resizeLabel: "调节 TID 列宽",
    defaultWidth: fieldPx(PROCESS_PID_WIDTH),
    minWidth: fieldPx(PROCESS_PID_WIDTH),
    flex: false,
    resize: false,
  },
  {
    key: "tag",
    header: "Tag",
    resizeLabel: "调节 Tag 列宽",
    defaultWidth: fieldPx(LOG_TAG_DEFAULT_CHARS),
    minWidth: fieldPx(TAG_MIN_LENGTH + 1),
    flex: false,
  },
  {
    key: "app",
    header: "应用",
    resizeLabel: "调节应用列宽",
    defaultWidth: fieldPx(APP_FORMAT_WIDTH),
    minWidth: fieldPx(APP_MIN_LENGTH + 1),
    flex: false,
    resize: false,
  },
  {
    key: "level",
    header: "级别",
    resizeLabel: "调节级别列宽",
    defaultWidth: fieldPx(LEVEL_FORMAT_WIDTH),
    minWidth: fieldPx(LEVEL_FORMAT_WIDTH),
    flex: false,
    resize: false,
  },
  {
    key: "msg",
    header: "消息",
    resizeLabel: "调节消息列宽",
    defaultWidth: fieldPx(LOG_MSG_DEFAULT_CHARS),
    minWidth: fieldPx(LOG_MSG_MIN_CHARS),
    flex: true,
  },
];

export function defaultLogColWidths(): LogColWidths {
  return defaultColWidths(LOG_COLUMNS) as LogColWidths;
}

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

export function processThreadWidth(style: ProcessThreadStyle): number {
  if (style === "both") {
    return PROCESS_BOTH_WIDTH;
  }
  if (style === "pid" || style === "tid") {
    return PROCESS_PID_WIDTH;
  }
  return 0;
}

export function visibleLogColumns(display: LogDisplayColumns): LogColumnSpec[] {
  return LOG_COLUMNS.filter((col) => {
    if (col.key === "msg") {
      return true;
    }
    if (col.key === "tid") {
      return display.tid && !display.pid;
    }
    if (col.key === "pid") {
      return display.pid;
    }
    return display[col.key];
  });
}

export function logColResizable(col: LogColumnSpec): boolean {
  return col.key === "tag";
}

export type TokenTone = "plain" | "ink" | "wash";
export type TokenBox = "glyph" | "line";
export type TokenStyle = {
  "--yohu-log-ink"?: string;
  "--yohu-log-level-fg"?: string;
  "--yohu-log-level-bg"?: string;
};
export type TokenPaint = {
  tone: TokenTone;
  box?: TokenBox;
  style?: TokenStyle;
};
export type ContentBar = "level" | "none";

export type FormatRange = {
  start: number;
  end: number;
  kind: LogFieldKind;
  tone?: TokenTone;
  box?: TokenBox;
  style?: TokenStyle;
};

export type FormatOptions = {
  display: LogDisplayColumns;
  tagWidthPx: number;
  timeFormat: TerminalTimeFormat;
  scheme?: string;
  /** 对照 MessageFormatter.softWrapEnabled */
  softWrap?: boolean;
  appNames?: AppNameMap;
};

export type FormattedMessage = {
  text: string;
  ranges: FormatRange[];
  headerChars: number;
  bar: ContentBar;
  barInk?: string;
};

export type FormatColumn = {
  key: LogColKey;
  header: string;
  width: number | null;
};

type ColorEngine = {
  id: LogColorScheme;
  bar: ContentBar;
  barInk(line: { level: string }): string | undefined;
  token(kind: LogFieldKind, line: { level: string; tag: string }): TokenPaint;
};

function ink(token: string): TokenPaint {
  return { tone: "ink", box: "glyph", style: { "--yohu-log-ink": token } };
}

function wash(fg: string, bg: string): TokenPaint {
  return {
    tone: "wash",
    box: "line",
    style: { "--yohu-log-level-fg": fg, "--yohu-log-level-bg": bg },
  };
}

function unstyled(): TokenPaint {
  return { tone: "plain", box: "glyph" };
}

type LevelSwatch = Lowercase<LevelLetter>;

function levelSwatch(level: string): LevelSwatch | null {
  const letter = parseLevelLetter(level);
  return letter ? (letter.toLowerCase() as LevelSwatch) : null;
}

const yohuEngine: ColorEngine = {
  id: "yohu",
  bar: "level",
  barInk(line) {
    const key = levelSwatch(line.level);
    return key ? `var(--yohu-level-${key})` : undefined;
  },
  token(kind, line) {
    if (kind === "ts" || kind === "uid") {
      return ink("var(--yohu-fg-3)");
    }
    if (kind === "pid" || kind === "tid" || kind === "app") {
      return ink("var(--yohu-fg-2)");
    }
    const key = levelSwatch(line.level);
    if (!key) {
      return kind === "msg" ? ink("var(--yohu-fg)") : unstyled();
    }
    if (kind === "level" && key === "f") {
      return wash("var(--yohu-fg-on)", "var(--yohu-level-f)");
    }
    return ink(`var(--yohu-level-${key})`);
  },
};

export const LOGCAT_TAG_SWATCHES = 80;

export function javaStringHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return hash;
}

export function tagSwatchIndex(tag: string): number {
  return Math.abs(javaStringHash(tag)) % LOGCAT_TAG_SWATCHES;
}

const logcatEngine: ColorEngine = {
  id: "logcat",
  bar: "none",
  barInk() {
    return undefined;
  },
  token(kind, line) {
    if (kind === "ts" || kind === "uid" || kind === "pid" || kind === "tid" || kind === "app") {
      return unstyled();
    }
    if (kind === "tag") {
      return ink(`var(--yohu-logcat-tag-${tagSwatchIndex(line.tag)})`);
    }
    const key = levelSwatch(line.level);
    if (!key) {
      return kind === "msg" ? ink("var(--yohu-fg)") : unstyled();
    }
    if (kind === "level") {
      return wash(`var(--yohu-logcat-level-${key})`, `var(--yohu-logcat-level-${key}-bg)`);
    }
    if (kind === "msg") {
      return ink(`var(--yohu-logcat-msg-${key})`);
    }
    return unstyled();
  },
};

const ENGINES: Record<LogColorScheme, ColorEngine> = {
  yohu: yohuEngine,
  logcat: logcatEngine,
};

export function contentColor(id: string | undefined): ColorEngine {
  return id && isLogColorScheme(id) ? ENGINES[id] : ENGINES[LOG_COLOR_SCHEME_DEFAULT];
}

export function defaultFormatOptions(display: LogDisplayColumns, scheme?: string): FormatOptions {
  return {
    display,
    tagWidthPx: defaultLogColWidths().tag,
    timeFormat: APP_SETTINGS_DEFAULT.log_time_format,
    scheme,
    softWrap: false,
  };
}

export function formatOptionsKey(options: FormatOptions): string {
  const d = options.display;
  return [
    options.timeFormat,
    options.scheme ?? "",
    options.softWrap ? "1" : "0",
    Number(d.ts),
    Number(d.uid),
    Number(d.pid),
    Number(d.tid),
    Number(d.tag),
    Number(d.app),
    Number(d.level),
    options.tagWidthPx,
  ].join("|");
}

function fieldChars(px: number, min: number): number {
  return Math.max(min, Math.floor(px / DEFAULT_CH_PX));
}

export function tagMaxLength(options: FormatOptions): number {
  return Math.max(TAG_MIN_LENGTH, fieldChars(options.tagWidthPx, TAG_MIN_LENGTH + 1) - 1);
}

export function tagFormatWidth(options: FormatOptions): number {
  return tagMaxLength(options) + 1;
}

function segmentWidth(key: LogMetaColKey, options: FormatOptions): number {
  switch (key) {
    case "ts":
      return timestampWidth(options.timeFormat);
    case "uid":
      return UID_FORMAT_WIDTH;
    case "pid":
    case "tid":
      return processThreadWidth(processThreadStyle(options.display)) || PROCESS_PID_WIDTH;
    case "tag":
      return tagFormatWidth(options);
    case "app":
      return APP_FORMAT_WIDTH;
    case "level":
      return LEVEL_FORMAT_WIDTH;
  }
}

export function formatColumns(options: FormatOptions): FormatColumn[] {
  return visibleLogColumns(options.display).map((col) => {
    if (col.key === "msg") {
      return { key: "msg", header: col.header, width: null };
    }
    return { key: col.key, header: col.header, width: segmentWidth(col.key, options) };
  });
}

/** 对照 FormattingOptions.getHeaderWidth()。不含消息。 */
export function headerWidth(options: FormatOptions): number {
  let n = 0;
  for (const col of formatColumns(options)) {
    if (col.key === "msg") {
      continue;
    }
    n += col.width ?? 0;
  }
  return n;
}

function padStartNum(value: number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : text.padStart(width);
}

function padEndNum(value: number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : text.padEnd(width);
}

/** IntelliJ StringUtil.shortenTextWithEllipsis(text, maxLength, suffixLength, "...") */
export function shortenTextWithEllipsis(text: string, maxLength: number, suffixLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  const prefix = Math.max(0, maxLength - suffixLength - TAG_ELLIPSIS.length);
  return `${text.slice(0, prefix)}${TAG_ELLIPSIS}${text.slice(text.length - suffixLength)}`;
}

export function formatTimestamp(ts: string, timeFormat: TerminalTimeFormat): string {
  return `${formatLogTs(ts, timeFormat)} `;
}

export function formatUid(uid: string | undefined): string {
  return `${uid ?? ""}`.padEnd(UID_BODY_CHARS) + " ";
}

export function formatProcessThread(line: { pid: number; tid: number }, style: ProcessThreadStyle): string {
  if (style === "both") {
    return `${padStartNum(line.pid, 5)}-${padEndNum(line.tid, 5)} `;
  }
  if (style === "pid") {
    return `${padEndNum(line.pid, 5)} `;
  }
  if (style === "tid") {
    return `${padEndNum(line.tid, 5)} `;
  }
  return "";
}

export function formatTag(tag: string, maxLength: number): string {
  const width = Math.max(TAG_MIN_LENGTH, maxLength) + 1;
  if (!tag) {
    return " ".padEnd(width);
  }
  if (tag.length > maxLength) {
    return `${shortenTextWithEllipsis(tag, maxLength, Math.floor((maxLength - TAG_ELLIPSIS.length) / 2))} `;
  }
  return tag.padEnd(width);
}

export function appNameOf(line: LogLine, names?: AppNameMap): string {
  if (line.app) {
    return line.app;
  }
  const mapped = names?.[line.pid];
  if (mapped) {
    return mapped;
  }
  if (line.pid === 0) {
    return "kernel";
  }
  return `pid-${line.pid}`;
}

export function formatAppName(name: string, maxLength = APP_DEFAULT_MAX): string {
  const width = Math.max(APP_MIN_LENGTH, maxLength) + 1;
  if (name.length > maxLength) {
    return `${shortenTextWithEllipsis(name, maxLength, maxLength - APP_PREFIX_KEEP)} `;
  }
  return name.padEnd(width);
}

type Accumulator = {
  text: string;
  ranges: FormatRange[];
};

function accumulate(buf: Accumulator, text: string, kind: LogFieldKind, paint?: TokenPaint): void {
  if (!text) {
    return;
  }
  const start = buf.text.length;
  buf.text += text;
  const end = buf.text.length;
  const range: FormatRange = { start, end, kind };
  if (paint && paint.tone !== "plain") {
    range.tone = paint.tone;
    range.box = paint.box;
    range.style = paint.style;
  }
  buf.ranges.push(range);
}

function paintOf(engine: ColorEngine, kind: LogFieldKind, line: LogLine): TokenPaint {
  return engine.token(kind, line);
}

export function formatMessage(line: LogLine, options: FormatOptions): FormattedMessage {
  const engine = contentColor(options.scheme);
  if (line.level === "?") {
    const buf: Accumulator = { text: "", ranges: [] };
    accumulate(buf, line.msg, "msg", paintOf(engine, "msg", line));
    return {
      text: buf.text,
      ranges: buf.ranges,
      headerChars: 0,
      bar: engine.bar,
      barInk: engine.barInk(line),
    };
  }
  const buf: Accumulator = { text: "", ranges: [] };
  const display = options.display;
  if (display.ts) {
    accumulate(buf, formatTimestamp(line.ts, options.timeFormat), "ts", paintOf(engine, "ts", line));
  }
  if (display.uid) {
    accumulate(buf, formatUid(line.uid), "uid", paintOf(engine, "uid", line));
  }
  const process = processThreadStyle(display);
  if (process !== "off") {
    const kind: LogFieldKind = process === "tid" ? "tid" : "pid";
    accumulate(buf, formatProcessThread(line, process), kind, paintOf(engine, kind, line));
  }
  if (display.tag) {
    accumulate(buf, formatTag(line.tag, tagMaxLength(options)), "tag", paintOf(engine, "tag", line));
  }
  if (display.app) {
    accumulate(buf, formatAppName(appNameOf(line, options.appNames)), "app", paintOf(engine, "app", line));
  }
  if (display.level) {
    accumulate(buf, ` ${line.level} `, "level", paintOf(engine, "level", line));
    accumulate(buf, " ", "level");
  }
  const headerChars = buf.text.length;
  const newline = options.softWrap ? "\n" : `\n${" ".repeat(headerChars)}`;
  accumulate(buf, line.msg.replaceAll("\n", newline), "msg", paintOf(engine, "msg", line));
  return {
    text: buf.text,
    ranges: buf.ranges,
    headerChars,
    bar: engine.bar,
    barInk: engine.barInk(line),
  };
}

export function formatParts(formatted: FormattedMessage): { kind: LogFieldKind; text: string }[] {
  const parts: { kind: LogFieldKind; text: string }[] = [];
  for (const range of formatted.ranges) {
    const text = formatted.text.slice(range.start, range.end);
    const last = parts.at(-1);
    if (last && last.kind === range.kind) {
      last.text += text;
      continue;
    }
    parts.push({ kind: range.kind, text });
  }
  return parts;
}
