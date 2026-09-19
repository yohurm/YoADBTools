/**
 * Formatter：对照 AS MessageFormatter + TextAccumulator + FormattingOptions + LogcatColors。
 * 一行一次 accumulate：文本即复制面，着色 range 当时挂上。
 * 禁止 import Document / View / store / CSS。
 */

import {
  APP_SETTINGS_DEFAULT,
  DATETIME_DISPLAY_LEN,
  TIME_DISPLAY_LEN,
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
import { defaultColWidths, Spacing } from "@yohu/ui";

/** 设计尺：1 字段字符 = 8px。列宽换算与复制面用这把尺，不跟 measureChPx。 */
export const DEFAULT_CH_PX = 8;
export const LOG_CH_PX = DEFAULT_CH_PX;
export const LOG_LEVEL_BADGE_CHARS = 3;

export type LogMetaColKey = keyof LogDisplayColumns;
export type LogColKey = LogMetaColKey | "msg";
export type LogColAlign = "start" | "end" | "center";
export type LogColWidths = Record<LogColKey, number>;
export type LogFieldKind = LogColKey;

export interface LogColumnSpec {
  key: LogColKey;
  header: string;
  resizeLabel: string;
  defaultWidth: number;
  minWidth: number;
  flex: boolean;
  resize?: boolean;
  align?: Exclude<LogColAlign, "start">;
}

export const DEFAULT_LOG_DISPLAY_COLUMNS: LogDisplayColumns = {
  ...APP_SETTINGS_DEFAULT.log_display_columns,
};

export const ALL_LOG_DISPLAY_COLUMNS: LogDisplayColumns = {
  ts: true,
  uid: true,
  pid: true,
  tid: true,
  level: true,
  tag: true,
};

export const LOG_PAD_LEFT_CHARS = Math.max(1, Math.round(Spacing.Md / DEFAULT_CH_PX));

export const LOG_FIELD_CHARS: Record<LogMetaColKey, number> = {
  ts: DATETIME_DISPLAY_LEN,
  uid: 8,
  pid: 5,
  tid: 5,
  level: 3,
  tag: 10,
};

export const LOG_LEVEL_GUTTER_CHARS = 1;
export const LOG_LEVEL_TRACK_CHARS = LOG_FIELD_CHARS.level + LOG_LEVEL_GUTTER_CHARS;
export const LOG_TAG_DEFAULT_CHARS = 24;
export const LOG_MSG_DEFAULT_CHARS = 12;
export const LOG_MSG_MIN_CHARS = 10;

export function headerLabelChars(header: string): number {
  let n = 0;
  for (const ch of header) {
    n += (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1;
  }
  return n;
}

export function logSlotChars(key: LogMetaColKey, header: string, timeFormat?: TerminalTimeFormat): number {
  if (key === "level") {
    return LOG_FIELD_CHARS.level;
  }
  const payload = key === "ts" && timeFormat != null ? clockDisplayLen(timeFormat) : LOG_FIELD_CHARS[key];
  return Math.max(payload, headerLabelChars(header));
}

function fieldPx(chars: number): number {
  return chars * DEFAULT_CH_PX;
}

export function tsFieldPx(format: TerminalTimeFormat): number {
  return clockDisplayLen(format) * DEFAULT_CH_PX;
}

function metaColPx(key: LogMetaColKey, header: string): number {
  return fieldPx(logSlotChars(key, header));
}

export const LOG_COLUMNS: readonly LogColumnSpec[] = [
  { key: "ts", header: "时间", resizeLabel: "调节时间列宽", defaultWidth: tsFieldPx(APP_SETTINGS_DEFAULT.log_time_format), minWidth: fieldPx(TIME_DISPLAY_LEN), flex: false },
  { key: "uid", header: "UID", resizeLabel: "调节 UID 列宽", defaultWidth: metaColPx("uid", "UID"), minWidth: metaColPx("uid", "UID"), flex: false, align: "end" },
  { key: "pid", header: "PID", resizeLabel: "调节 PID 列宽", defaultWidth: metaColPx("pid", "PID"), minWidth: metaColPx("pid", "PID"), flex: false, align: "end" },
  { key: "tid", header: "TID", resizeLabel: "调节 TID 列宽", defaultWidth: metaColPx("tid", "TID"), minWidth: metaColPx("tid", "TID"), flex: false, align: "end" },
  { key: "tag", header: "Tag", resizeLabel: "调节 Tag 列宽", defaultWidth: fieldPx(LOG_TAG_DEFAULT_CHARS), minWidth: metaColPx("tag", "Tag"), flex: false },
  { key: "level", header: "级别", resizeLabel: "调节级别列宽", defaultWidth: fieldPx(LOG_LEVEL_TRACK_CHARS), minWidth: fieldPx(LOG_LEVEL_TRACK_CHARS), flex: false, resize: false },
  { key: "msg", header: "消息", resizeLabel: "调节消息列宽", defaultWidth: fieldPx(LOG_MSG_DEFAULT_CHARS), minWidth: fieldPx(LOG_MSG_MIN_CHARS), flex: true },
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

export function logColResizable(col: LogColumnSpec): boolean {
  return !col.flex && col.resize !== false;
}

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
      return ` ${line.level} `;
    case "tag":
      return line.tag;
    case "msg":
      return line.msg;
  }
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
  role: "pad" | "field";
  tone?: TokenTone;
  box?: TokenBox;
  style?: TokenStyle;
};

export type FormatOptions = {
  display: LogDisplayColumns;
  widths: LogColWidths;
  chPx: number;
  timeFormat: TerminalTimeFormat;
  scheme?: string;
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
  chars: number | null;
  padLeft: number;
  gutter: 0 | 1;
  align: "start" | "end";
  minWidthPx: number;
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
    if (kind === "pid" || kind === "tid") {
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
    if (kind === "ts" || kind === "uid" || kind === "pid" || kind === "tid") {
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
    widths: defaultLogColWidths(),
    chPx: DEFAULT_CH_PX,
    timeFormat: APP_SETTINGS_DEFAULT.log_time_format,
    scheme,
  };
}

export function formatOptionsKey(options: FormatOptions): string {
  const d = options.display;
  const w = options.widths;
  return [
    options.timeFormat,
    options.scheme ?? "",
    Number(d.ts),
    Number(d.uid),
    Number(d.pid),
    Number(d.tid),
    Number(d.level),
    Number(d.tag),
    w.ts,
    w.uid,
    w.pid,
    w.tid,
    w.level,
    w.tag,
    w.msg,
  ].join("|");
}

export function fieldChars(px: number, min: number): number {
  return Math.max(min, Math.floor(px / LOG_CH_PX));
}

export function padLeftChars(): number {
  return LOG_PAD_LEFT_CHARS;
}

function alignOf(key: LogColKey): "start" | "end" {
  return LOG_COLUMNS.find((col) => col.key === key)?.align === "end" ? "end" : "start";
}

export function formatColumns(options: FormatOptions): FormatColumn[] {
  const padLeft = padLeftChars();
  const levelOn = options.display.level;
  return visibleLogColumns(options.display).map((col) => {
    if (col.key === "msg") {
      return {
        key: "msg",
        header: col.header,
        chars: null,
        padLeft: 0,
        gutter: 0,
        align: "start",
        minWidthPx: col.minWidth,
      };
    }
    if (col.key === "level") {
      return {
        key: "level",
        header: col.header,
        chars: LOG_FIELD_CHARS.level,
        padLeft: 0,
        gutter: LOG_LEVEL_GUTTER_CHARS,
        align: "start",
        minWidthPx: col.minWidth,
      };
    }
    const minCh = logSlotChars(col.key, col.header, options.timeFormat);
    const chars = fieldChars(options.widths[col.key] ?? col.defaultWidth, minCh);
    const gutter = col.key === "tag" && levelOn ? 0 : 1;
    return {
      key: col.key,
      header: col.header,
      chars,
      padLeft,
      gutter,
      align: alignOf(col.key),
      minWidthPx: Math.max(col.minWidth, (padLeft + minCh + gutter) * options.chPx),
    };
  });
}

export function columnTrackCh(col: FormatColumn): number | null {
  return col.chars == null ? null : col.padLeft + col.chars + col.gutter;
}

export function columnTrackPx(col: FormatColumn, chPx: number): number {
  const ch = columnTrackCh(col);
  return ch == null ? col.minWidthPx : ch * chPx;
}

export function trackTemplate(options: FormatOptions): string {
  return formatColumns(options)
    .map((col) => {
      if (col.chars == null) {
        const minCh = Math.max(1, Math.floor(col.minWidthPx / Math.max(options.chPx, 1)));
        return `minmax(${minCh}ch, 1fr)`;
      }
      return `${col.padLeft + col.chars + col.gutter}ch`;
    })
    .join(" ");
}

/** 前缀轨道合计。续行 hang 与首行消息起笔同一把尺。 */
export function hangChars(options: FormatOptions): number {
  let n = 0;
  for (const col of formatColumns(options)) {
    if (col.key === "msg") {
      continue;
    }
    n += columnTrackCh(col) ?? 0;
  }
  return n;
}

export function clipPadField(text: string, width: number, align: "start" | "end"): string {
  const n = Math.max(1, width);
  let body = text;
  if (body.length > n) {
    body = n === 1 ? body.slice(0, 1) : `${body.slice(0, n - 1)}…`;
  }
  return align === "end" ? body.padStart(n) : body.padEnd(n);
}

export function splitDocField(text: string): { lead: string; body: string; trail: string } {
  const body = text.trim();
  if (!body) {
    return { lead: text, body: "", trail: "" };
  }
  const start = text.indexOf(body);
  if (start < 0) {
    return { lead: text, body: "", trail: "" };
  }
  return {
    lead: text.slice(0, start),
    body,
    trail: text.slice(start + body.length),
  };
}

function rawField(line: LogLine, key: LogMetaColKey, format: TerminalTimeFormat): string {
  switch (key) {
    case "ts":
      return formatLogTs(line.ts, format);
    case "uid":
      return line.uid ?? "";
    case "pid":
      return String(line.pid);
    case "tid":
      return String(line.tid);
    case "level":
      return ` ${line.level} `;
    case "tag":
      return line.tag;
  }
}

type Accumulator = {
  text: string;
  ranges: FormatRange[];
};

function accumulate(
  buf: Accumulator,
  text: string,
  kind: LogFieldKind,
  role: "pad" | "field",
  paint?: TokenPaint,
): void {
  if (!text) {
    return;
  }
  const start = buf.text.length;
  buf.text += text;
  const end = buf.text.length;
  const range: FormatRange = { start, end, kind, role };
  if (role === "field" && paint) {
    range.tone = paint.tone;
    range.box = paint.box;
    range.style = paint.style;
  }
  buf.ranges.push(range);
}

function paintOf(engine: ColorEngine, kind: LogFieldKind, line: LogLine): TokenPaint {
  return engine.token(kind, line);
}

/** 一行 → 文本 + range。hang 不写入空格。 */
export function formatMessage(line: LogLine, options: FormatOptions): FormattedMessage {
  const engine = contentColor(options.scheme);
  if (line.level === "?") {
    const buf: Accumulator = { text: "", ranges: [] };
    accumulate(buf, line.msg, "msg", "field", paintOf(engine, "msg", line));
    return {
      text: buf.text,
      ranges: buf.ranges,
      headerChars: 0,
      bar: engine.bar,
      barInk: engine.barInk(line),
    };
  }
  const columns = formatColumns(options);
  const buf: Accumulator = { text: "", ranges: [] };
  let headerChars = 0;
  for (const col of columns) {
    if (col.key === "msg" || col.chars == null) {
      accumulate(buf, " ".repeat(col.padLeft), "msg", "pad");
      accumulate(buf, line.msg, "msg", "field", paintOf(engine, "msg", line));
      continue;
    }
    if (col.key === "level") {
      const start = buf.text.length;
      accumulate(buf, ` ${line.level} `, "level", "field", paintOf(engine, "level", line));
      accumulate(buf, " ".repeat(col.gutter), "level", "pad");
      headerChars += buf.text.length - start;
      continue;
    }
    const clipped = clipPadField(rawField(line, col.key, options.timeFormat), col.chars, col.align);
    const split = splitDocField(clipped);
    const start = buf.text.length;
    accumulate(buf, `${" ".repeat(col.padLeft)}${split.lead}`, col.key, "pad");
    accumulate(buf, split.body, col.key, "field", paintOf(engine, col.key, line));
    accumulate(buf, `${split.trail}${" ".repeat(col.gutter)}`, col.key, "pad");
    headerChars += buf.text.length - start;
  }
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
