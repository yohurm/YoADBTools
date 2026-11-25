/**
 * Formatter 文本：按列序拼一条消息。
 * 顺序：Timestamp → Uid（扩展）→ ProcessThread → Tag → AppName → Level → message。
 * Soft-Wrap 关：msg 里的 \\n 换成 \\n + headerWidth 空格；开：裸 \\n。布局由 FormatOptions.layout 单源派生。
 * 禁止 CSS hang、禁止 import Document / Board / View / store。
 */

import { formatLogTs, type LogLine, type TerminalTimeFormat } from "@yohu/api";

import {
  APP_DEFAULT_MAX,
  APP_MIN_LENGTH,
  APP_PREFIX_KEEP,
  LEVEL_LETTER_SPAN,
  LEVEL_FORMAT_WIDTH,
  PID_BODY_WIDTH,
  PROCESS_PID_WIDTH,
  TAG_ELLIPSIS,
  TAG_MIN_LENGTH,
  UID_BODY_CHARS,
  formatColumns,
  formatWraps,
  logFieldIsLevel,
  logFieldIsMessage,
  metaColChars,
  processColChars,
  processThreadIsBoth,
  processThreadIsPid,
  processThreadIsTid,
  processThreadStyle,
  tagFormatWidth,
  type AppNameMap,
  type FormatOptions,
  type LogColKey,
  type ProcessThreadStyle,
} from "./format-columns";
import {
  contentColor,
  logcatLevelLetter,
  type ContentBar,
  type FormatRange,
  type TokenPaint,
} from "./format-paint";
import { tokenToneIsPlain } from "./token-tone";

export type FormattedMessage = {
  text: string;
  ranges: FormatRange[];
  headerChars: number;
  bar: ContentBar;
  barInk?: string;
};

function padField(text: string, width: number): string {
  return text.length >= width ? text : text.padEnd(width);
}

function padStartNum(value: number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : text.padStart(width);
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
    return `${padField(`${padStartNum(line.pid, PID_BODY_WIDTH)}-`, pidChars)}${padField(`${padEndNum(line.tid, PID_BODY_WIDTH)} `, tidChars)}`;
  }
  if (processThreadIsPid(style)) {
    return padField(`${padEndNum(line.pid, PID_BODY_WIDTH)} `, pidChars);
  }
  if (processThreadIsTid(style)) {
    return padField(`${padEndNum(line.tid, PID_BODY_WIDTH)} `, tidChars);
  }
  return "";
}

function spanWidth(min: number, maxLength: number): number {
  return Math.max(min, maxLength) + 1;
}

export function formatTag(tag: string, maxLength: number): string {
  const width = spanWidth(TAG_MIN_LENGTH, maxLength);
  if (!tag) {
    return padField("<no-tag>", width);
  }
  if (tag.length > maxLength) {
    return ellipsisSpan(tag, maxLength, Math.floor((maxLength - TAG_ELLIPSIS.length) / 2));
  }
  return padField(tag, width);
}

export function appNameOf(line: LogLine, names?: AppNameMap): string {
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
  const width = spanWidth(APP_MIN_LENGTH, maxLength);
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

function paintOf(engine: ReturnType<typeof contentColor>, kind: LogColKey, line: LogLine): TokenPaint {
  return engine.token(kind, line);
}

function packMessage(
  buf: Accumulator,
  headerChars: number,
  engine: ReturnType<typeof contentColor>,
  line: LogLine,
): FormattedMessage {
  return {
    text: buf.text,
    ranges: buf.ranges,
    headerChars,
    bar: engine.bar,
    barInk: engine.barInk(line),
  };
}

/** 级别格：`" L "` = LEVEL_LETTER_SPAN 格（末尾再补 LEVEL_FORMAT_WIDTH - LEVEL_LETTER_SPAN 个空格）。 */
function levelLetterCell(letter: string): string {
  const lead = Math.floor((LEVEL_LETTER_SPAN - 1) / 2);
  const trail = LEVEL_LETTER_SPAN - 1 - lead;
  return `${" ".repeat(lead)}${letter}${" ".repeat(trail)}`;
}

export function formatMessage(line: LogLine, options: FormatOptions): FormattedMessage {
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
      const newline = formatWraps(options) ? "\n" : `\n${" ".repeat(headerChars)}`;
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
        formatTag(line.tag, tagFormatWidth(options) - 1),
        col.key,
        paintOf(engine, col.key, line),
      );
      continue;
    }
    if (col.key === "app") {
      accumulate(
        buf,
        formatAppName(appNameOf(line, options.appNames), metaColChars(options, "app") - 1),
        col.key,
        paintOf(engine, col.key, line),
      );
      continue;
    }
    if (logFieldIsLevel(col.key)) {
      const letter = logcatLevelLetter(line.level);
      accumulate(buf, levelLetterCell(letter), col.key, paintOf(engine, col.key, line));
      accumulate(buf, " ".repeat(LEVEL_FORMAT_WIDTH - LEVEL_LETTER_SPAN), col.key);
    }
  }
  return packMessage(buf, buf.text.length, engine, line);
}

export function formatMessages(lines: readonly LogLine[], options: FormatOptions): FormattedMessage[] {
  return lines.map((line) => formatMessage(line, options));
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
