/**
 * Formatter：对照 AS MessageFormatter + FormattingOptions + TextAccumulator。
 * 顺序：Timestamp → Uid（扩展）→ ProcessThread → Tag → AppName → Level → message。
 * Soft-Wrap 关：msg 里的 \\n 换成 \\n + headerWidth 空格，写入文档。
 * Soft-Wrap 开：裸 \\n，续行第 0 列。
 * 表头轨道走 ch（wrap 时消息列 minmax(0,1fr)）；行仍是文档，禁止把 1fr 写进 Document。
 * 禁止 CSS hang、禁止 import Document / Board / View / store。
 */

import {
  APP_SETTINGS_DEFAULT,
  clockDisplayLen,
  formatLogTs,
  isLogColorScheme,
  LOG_COLOR_SCHEME_DEFAULT,
  LOG_DISPLAY_COLUMN_CATALOG,
  LOG_MESSAGE_COLUMN,
  levelKey,
  type LogColorScheme,
  type LogDisplayColumns,
  type LogLine,
  type TerminalTimeFormat,
} from "@yohu/api";

import { tokenToneIsPlain, type TokenTone } from "./token-tone";

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
export type ProcessThreadStyle = "off" | "pid" | "tid" | "both";
export type AppNameMap = Readonly<Record<number, string>>;

/** 官方 TagFormat.maxLength 对应的默认像素：maxLength+1 个 ch。 */
export const TAG_DEFAULT_WIDTH_PX = (TAG_DEFAULT_MAX + 1) * DEFAULT_CH_PX;

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

export function processThreadWidth(style: ProcessThreadStyle): number {
  if (processThreadIsBoth(style)) {
    return PROCESS_BOTH_WIDTH;
  }
  if (processThreadIsPid(style) || processThreadIsTid(style)) {
    return PROCESS_PID_WIDTH;
  }
  return 0;
}

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
  kind: LogColKey;
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
  /** 列宽覆盖（ch）。缺省走官方 Format.width()；拖宽只加不减官方下限。 */
  colChars?: Partial<Record<LogMetaColKey, number>>;
  /** 对照 AS `TagFormat.hideDuplicates`（STANDARD 默认 false） */
  hideDuplicateTag?: boolean;
  /** 对照 AS `AppNameFormat.hideDuplicates`（STANDARD 默认 false） */
  hideDuplicateApp?: boolean;
};

/** 对照 AS `MessageFormatter` 批内 `previousTag` / `previousPid`。 */
export type FormatBatchState = {
  previousTag?: string;
  previousPid?: number;
};

export function batchCursor(line: { tag: string; pid: number }): FormatBatchState {
  return { previousTag: line.tag, previousPid: line.pid };
}

export type FormattedMessage = {
  text: string;
  ranges: FormatRange[];
  headerChars: number;
  bar: ContentBar;
  barInk?: string;
};

export type FormatColumn = {
  key: LogColKey;
  width: number | null;
};

type ColorEngine = {
  id: LogColorScheme;
  bar: ContentBar;
  barInk(line: { level: string }): string | undefined;
  token(kind: LogColKey, line: { level: string; tag: string }): TokenPaint;
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

/** 消息列。配色、表头宽度和标题栏都认这一把。 */
export function logFieldIsMessage(kind: LogColKey): kind is "msg" {
  return kind === "msg";
}

/** 级别列。配色和表头可拖性都认这一把。 */
export function logFieldIsLevel(kind: LogColKey): kind is "level" {
  return kind === "level";
}

/** 时间与 uid。两套配色都认这一组。 */
function logFieldIsClock(kind: LogColKey): boolean {
  return kind === "ts" || kind === "uid";
}

/** 进程、线程与应用名。两套配色都认这一组。 */
function logFieldIsProcess(kind: LogColKey): boolean {
  return kind === "pid" || kind === "tid" || kind === "app";
}

/** 没有级别色时：消息用正文色，其余列不涂。两套配色都认这一把。 */
function plainMessageInk(kind: LogColKey): TokenPaint {
  return logFieldIsMessage(kind) ? ink("var(--yohu-fg)") : unstyled();
}

function levelInk(
  kind: LogColKey,
  key: ReturnType<typeof levelKey>,
  paint: (key: NonNullable<ReturnType<typeof levelKey>>) => TokenPaint,
): TokenPaint {
  if (!key) {
    return plainMessageInk(kind);
  }
  return paint(key);
}

export function yohuLevelVar(key: NonNullable<ReturnType<typeof levelKey>>): string {
  return `var(--yohu-level-${key})`;
}

const yohuEngine: ColorEngine = {
  id: "yohu",
  bar: "level",
  barInk(line) {
    const key = levelKey(line.level);
    return key ? yohuLevelVar(key) : undefined;
  },
  token(kind, line) {
    if (logFieldIsClock(kind)) {
      return ink("var(--yohu-fg-3)");
    }
    if (logFieldIsProcess(kind)) {
      return ink("var(--yohu-fg-2)");
    }
    return levelInk(kind, levelKey(line.level), (key) => {
      if (logFieldIsLevel(kind)) {
        return wash("var(--yohu-fg-on)", yohuLevelVar(key));
      }
      return ink(yohuLevelVar(key));
    });
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

/** 设备 FATAL 字母。清单显示成 A，配色仍按 F。 */
function levelIsDeviceFatal(level: string): boolean {
  return level === "F";
}

/** 官方 ASSERT：设备 F，或清单里已经写成 A。配色都按 F。 */
function levelIsAssert(level: string): boolean {
  return levelIsDeviceFatal(level) || level === "A";
}

function logcatLevelSwatch(level: string) {
  const paint = levelIsAssert(level) ? "F" : level;
  return levelKey(paint);
}

function logcatLevelVar(key: NonNullable<ReturnType<typeof levelKey>>, suffix = ""): string {
  return `var(--yohu-logcat-level-${key}${suffix})`;
}

const logcatEngine: ColorEngine = {
  id: "logcat",
  bar: "none",
  barInk() {
    return undefined;
  },
  token(kind, line) {
    if (logFieldIsClock(kind) || logFieldIsProcess(kind)) {
      return unstyled();
    }
    if (kind === "tag") {
      return ink(`var(--yohu-logcat-tag-${tagSwatchIndex(line.tag)})`);
    }
    return levelInk(kind, logcatLevelSwatch(line.level), (key) => {
      if (logFieldIsLevel(kind)) {
        return wash(logcatLevelVar(key), logcatLevelVar(key, "-bg"));
      }
      if (logFieldIsMessage(kind)) {
        return ink(`var(--yohu-logcat-msg-${key})`);
      }
      return unstyled();
    });
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
    tagWidthPx: TAG_DEFAULT_WIDTH_PX,
    timeFormat: APP_SETTINGS_DEFAULT.log_time_format,
    scheme,
    softWrap: false,
  };
}

function flagOn(value: boolean | undefined): boolean {
  return value ?? false;
}

function bit(value: boolean): number {
  return Number(value);
}

export function formatOptionsKey(options: FormatOptions): string {
  const d = options.display;
  return [
    options.timeFormat,
    options.scheme ?? "",
    options.softWrap ? "1" : "0",
    bit(d.ts),
    bit(d.uid),
    bit(d.pid),
    bit(d.tid),
    bit(d.tag),
    bit(d.app),
    bit(d.level),
    options.tagWidthPx,
    JSON.stringify(options.colChars ?? {}),
    bit(flagOn(options.hideDuplicateTag)),
    bit(flagOn(options.hideDuplicateApp)),
  ].join("|");
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

function processColChars(options: FormatOptions, key: "pid" | "tid"): number {
  return colCharsOf(options, key, PROCESS_PID_WIDTH);
}

function metaColChars(options: FormatOptions, key: "ts" | "uid" | "app"): number {
  const fallback =
    key === "ts" ? timestampWidth(options.timeFormat)
    : key === "uid" ? UID_FORMAT_WIDTH
    : APP_FORMAT_WIDTH;
  return colCharsOf(options, key, fallback);
}

function padField(text: string, width: number): string {
  return text.length >= width ? text : text.padEnd(width);
}

export function logFieldLabel(key: LogColKey): string {
  if (key === LOG_MESSAGE_COLUMN.key) {
    return LOG_MESSAGE_COLUMN.label;
  }
  return LOG_DISPLAY_COLUMN_CATALOG.find((item) => item.key === key)?.label ?? key;
}

export type LogHeaderColumn = {
  key: LogColKey;
  label: string;
  width: number | null;
  resizable: boolean;
};

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
        return options.softWrap ? "minmax(0, 1fr)" : "max-content";
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

function padStartNum(value: number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : text.padStart(width);
}

function blankField(width: number): string {
  return padField("", width);
}

function padEndNum(value: number, width: number): string {
  return padField(String(value), width);
}

/** IntelliJ StringUtil.shortenTextWithEllipsis(text, maxLength, suffixLength, "...") */
export function shortenTextWithEllipsis(text: string, maxLength: number, suffixLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  const prefix = Math.max(0, maxLength - suffixLength - TAG_ELLIPSIS.length);
  return `${text.slice(0, prefix)}${TAG_ELLIPSIS}${text.slice(text.length - suffixLength)}`;
}

function ellipsisSpan(text: string, maxLength: number, suffixLength: number): string {
  return `${shortenTextWithEllipsis(text, maxLength, suffixLength)} `;
}

export function formatTimestamp(ts: string, timeFormat: TerminalTimeFormat): string {
  return `${formatLogTs(ts, timeFormat)} `;
}

export function formatUid(uid: string | undefined): string {
  return padField(`${uid ?? ""}`, UID_BODY_CHARS) + " ";
}

export function formatProcessThread(
  line: { pid: number; tid: number },
  style: ProcessThreadStyle,
  pidChars = PROCESS_PID_WIDTH,
  tidChars = PROCESS_PID_WIDTH,
): string {
  if (processThreadIsBoth(style)) {
    return `${padField(`${padStartNum(line.pid, 5)}-`, pidChars)}${padField(`${padEndNum(line.tid, 5)} `, tidChars)}`;
  }
  if (processThreadIsPid(style)) {
    return padField(`${padEndNum(line.pid, 5)} `, pidChars);
  }
  if (processThreadIsTid(style)) {
    return padField(`${padEndNum(line.tid, 5)} `, tidChars);
  }
  return "";
}

/** AS `LevelFormat`：设备 FATAL（`F`）在清单里显示为 ASSERT 字母 `A`。 */
export function logcatLevelLetter(level: string): string {
  if (levelIsDeviceFatal(level)) {
    return "A";
  }
  return level;
}

function spanWidth(min: number, maxLength: number): number {
  return Math.max(min, maxLength) + 1;
}

export function formatTag(
  tag: string,
  maxLength: number,
  previousTag?: string,
  hideDuplicates = false,
): string {
  const width = spanWidth(TAG_MIN_LENGTH, maxLength);
  if (hideDuplicates && tag === previousTag) {
    return blankField(width);
  }
  if (!tag) {
    return padField("<no-tag>", width);
  }
  if (tag.length > maxLength) {
    return ellipsisSpan(tag, maxLength, Math.floor((maxLength - TAG_ELLIPSIS.length) / 2));
  }
  return padField(tag, width);
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

export function formatAppName(
  name: string,
  maxLength = APP_DEFAULT_MAX,
  pid?: number,
  previousPid?: number,
  hideDuplicates = false,
): string {
  const width = spanWidth(APP_MIN_LENGTH, maxLength);
  if (hideDuplicates && pid != null && pid === previousPid) {
    return blankField(width);
  }
  if (name.length > maxLength) {
    return ellipsisSpan(name, maxLength, maxLength - APP_PREFIX_KEEP);
  }
  return padField(name, width);
}

type Accumulator = {
  text: string;
  ranges: FormatRange[];
};

function accumulate(buf: Accumulator, text: string, kind: LogColKey, paint?: TokenPaint): void {
  if (!text) {
    return;
  }
  const start = buf.text.length;
  buf.text += text;
  const end = buf.text.length;
  const range: FormatRange = { start, end, kind };
  if (paint && !tokenToneIsPlain(paint.tone)) {
    range.tone = paint.tone;
    range.box = paint.box;
    range.style = paint.style;
  }
  buf.ranges.push(range);
}

function paintOf(engine: ColorEngine, kind: LogColKey, line: LogLine): TokenPaint {
  return engine.token(kind, line);
}

function packMessage(buf: Accumulator, headerChars: number, engine: ColorEngine, line: LogLine): FormattedMessage {
  return {
    text: buf.text,
    ranges: buf.ranges,
    headerChars,
    bar: engine.bar,
    barInk: engine.barInk(line),
  };
}

export function formatMessage(
  line: LogLine,
  options: FormatOptions,
  batch: FormatBatchState = {},
): FormattedMessage {
  const engine = contentColor(options.scheme);
  if (line.level === "?") {
    const buf: Accumulator = { text: "", ranges: [] };
    accumulate(buf, line.msg, "msg", paintOf(engine, "msg", line));
    return packMessage(buf, 0, engine, line);
  }
  const buf: Accumulator = { text: "", ranges: [] };
  for (const col of formatColumns(options)) {
    if (logFieldIsMessage(col.key)) {
      const headerChars = buf.text.length;
      const newline = options.softWrap ? "\n" : `\n${" ".repeat(headerChars)}`;
      accumulate(buf, line.msg.replaceAll("\n", newline), col.key, paintOf(engine, col.key, line));
      return packMessage(buf, headerChars, engine, line);
    }
    if (col.key === "ts") {
      accumulate(
        buf,
        padField(formatTimestamp(line.ts, options.timeFormat), metaColChars(options, "ts")),
        col.key,
        paintOf(engine, col.key, line),
      );
      continue;
    }
    if (col.key === "uid") {
      accumulate(
        buf,
        padField(formatUid(line.uid), metaColChars(options, "uid")),
        col.key,
        paintOf(engine, col.key, line),
      );
      continue;
    }
    if (col.key === "pid" || col.key === "tid") {
      const process = processThreadStyle(options.display);
      const pidChars = processColChars(options, "pid");
      const tidChars = processColChars(options, "tid");
      accumulate(
        buf,
        formatProcessThread(line, process, pidChars, tidChars),
        col.key,
        paintOf(engine, col.key, line),
      );
      continue;
    }
    if (col.key === "tag") {
      accumulate(
        buf,
        formatTag(
          line.tag,
          tagFormatWidth(options) - 1,
          batch.previousTag,
          flagOn(options.hideDuplicateTag),
        ),
        col.key,
        paintOf(engine, col.key, line),
      );
      continue;
    }
    if (col.key === "app") {
      accumulate(
        buf,
        formatAppName(
          appNameOf(line, options.appNames),
          metaColChars(options, "app") - 1,
          line.pid,
          batch.previousPid,
          flagOn(options.hideDuplicateApp),
        ),
        col.key,
        paintOf(engine, col.key, line),
      );
      continue;
    }
    if (logFieldIsLevel(col.key)) {
      const letter = logcatLevelLetter(line.level);
      accumulate(buf, ` ${letter} `, col.key, paintOf(engine, col.key, line));
      accumulate(buf, " ", col.key);
    }
  }
  return packMessage(buf, buf.text.length, engine, line);
}

export function formatMessages(
  lines: readonly LogLine[],
  options: FormatOptions,
  seed: FormatBatchState = {},
): { messages: FormattedMessage[]; state: FormatBatchState } {
  let state = seed;
  const messages: FormattedMessage[] = [];
  for (const line of lines) {
    messages.push(formatMessage(line, options, state));
    state = batchCursor(line);
  }
  return { messages, state };
}

export function formatParts(formatted: {
  text: string;
  ranges: readonly FormatRange[];
}): { kind: LogColKey; text: string }[] {
  const parts: { kind: LogColKey; text: string }[] = [];
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
