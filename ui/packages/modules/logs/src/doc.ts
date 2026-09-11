/**
 * 清单文档：对照 AS Logcat MessageFormatter → TextAccumulator → Document。
 * 列间空白是 pad 空格，不是 CSS 格子剩余。join(parts) 即选区/复制表面。
 * 消息是 line.msg 原文；冒号只属于导出 compact，不进清单文档。
 * 表头与行共用 logDocColumns 这一把尺：轨道是 (padLeft+chars+gutter)ch。
 * 列垫（YoColFrame list = space-md 左）也在这把尺里，不是表头单独一份 CSS。
 * domain formatLogLine 只给导出，不进这条链。
 */

import { APP_SETTINGS_DEFAULT, formatLogTs, type LogDisplayColumns, type LogLine, type TerminalTimeFormat } from "@yohu/api";
import { Spacing } from "@yohu/ui";

import type { LogLinePart } from "./format";
import {
  defaultLogColWidths,
  logSlotChars,
  LOG_CH_PX,
  LOG_COLUMNS,
  visibleLogColumns,
  type LogColKey,
  type LogColWidths,
  type LogMetaColKey,
} from "./layout";

export const DEFAULT_CH_PX = LOG_CH_PX;

export interface LogDocLayout {
  display: LogDisplayColumns;
  widths: LogColWidths;
  chPx: number;
  timeFormat: TerminalTimeFormat;
}

export function defaultLogDocLayout(display: LogDisplayColumns): LogDocLayout {
  return {
    display,
    widths: defaultLogColWidths(),
    chPx: DEFAULT_CH_PX,
    timeFormat: APP_SETTINGS_DEFAULT.log_time_format,
  };
}

export interface LogDocColumn {
  key: LogColKey;
  header: string;
  resizeLabel: string;
  /** 字段本体字符数；消息列为 null（1fr）。 */
  chars: number | null;
  /** 与表头 `--yohu-col-cell-pad` 左垫同一起笔。 */
  padLeft: number;
  /** 列间空格；消息 0。 */
  gutter: 0 | 1;
  align: "start" | "end";
  flex: boolean;
  minWidthPx: number;
}

/** 字段 px → 字符。用设计尺 LOG_CH_PX，不用 measureChPx（小字会把默认列撑开）。 */
export function fieldChars(px: number, min: number): number {
  return Math.max(min, Math.floor(px / LOG_CH_PX));
}

/** 表头左垫 space-md → 字符。禁止 cellPad=none 把标题贴格边。 */
export function padLeftChars(chPx: number): number {
  return Math.max(1, Math.round(Spacing.Md / Math.max(chPx, 1)));
}

export function logDocColumns(layout: LogDocLayout): LogDocColumn[] {
  const padLeft = padLeftChars(layout.chPx);
  return visibleLogColumns(layout.display).map((col) => {
    if (col.key === "msg") {
      return {
        key: "msg",
        header: col.header,
        resizeLabel: col.resizeLabel,
        chars: null,
        padLeft,
        gutter: 0,
        align: "start",
        flex: true,
        minWidthPx: col.minWidth,
      };
    }
    const minCh = logSlotChars(col.key, col.header, layout.timeFormat);
    const chars = fieldChars(layout.widths[col.key] ?? col.defaultWidth, minCh);
    return {
      key: col.key,
      header: col.header,
      resizeLabel: col.resizeLabel,
      chars,
      padLeft,
      gutter: 1,
      align: alignOf(col.key),
      flex: false,
      minWidthPx: Math.max(col.minWidth, (padLeft + minCh + 1) * layout.chPx),
    };
  });
}

export function logDocTrackCh(col: LogDocColumn): number | null {
  return col.chars == null ? null : col.padLeft + col.chars + col.gutter;
}

export function logDocTrackPx(col: LogDocColumn, chPx: number): number {
  const ch = logDocTrackCh(col);
  return ch == null ? col.minWidthPx : ch * chPx;
}

/** 表头 --yohu-col-tracks：与 formatLogDoc 同一把 ch 尺。 */
export function logDocTrackTemplate(layout: LogDocLayout): string {
  return logDocColumns(layout)
    .map((col) => {
      if (col.chars == null) {
        const minCh = Math.max(1, Math.floor(col.minWidthPx / Math.max(layout.chPx, 1)));
        return `minmax(${minCh}ch, 1fr)`;
      }
      return `${col.padLeft + col.chars + col.gutter}ch`;
    })
    .join(" ");
}

/**
 * 只能量行内探针。行 class 是 display:block，会吃满宿主宽，
 * chPx 变成整行/10，列全部被压到 logSlotChars（表头 PID+级别粘连、Tag 无 pad）。
 */
export function measureChPx(host: HTMLElement): number {
  const probe = document.createElement("span");
  probe.className = "yohu-logs__ch-probe";
  probe.textContent = "0000000000";
  host.append(probe);
  const width = probe.getBoundingClientRect().width / 10;
  probe.remove();
  if (!(width > 0) || width < 4 || width > 20) {
    return DEFAULT_CH_PX;
  }
  return width;
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
      return line.level;
    case "tag":
      return line.tag;
  }
}

/** Logcat TagFormat / ProcessThreadFormat：超出则省略，短则 pad，空格进文档。 */
export function clipPadField(text: string, width: number, align: "start" | "end"): string {
  const n = Math.max(1, width);
  let body = text;
  if (body.length > n) {
    body = n === 1 ? body.slice(0, 1) : `${body.slice(0, n - 1)}…`;
  }
  return align === "end" ? body.padStart(n) : body.padEnd(n);
}

function alignOf(key: LogColKey): "start" | "end" {
  return LOG_COLUMNS.find((col) => col.key === key)?.align === "end" ? "end" : "start";
}

export function formatLogDocParts(line: LogLine, layout: LogDocLayout): LogLinePart[] {
  if (line.level === "?") {
    return [{ kind: "msg", text: line.msg }];
  }
  const parts: LogLinePart[] = [];
  for (const col of logDocColumns(layout)) {
    const lead = " ".repeat(col.padLeft);
    if (col.key === "msg" || col.chars == null) {
      // 对照 AS MessageFormatter：message 原样进文档。冒号只属于导出 compact（formatLogLine / threadtime）。
      parts.push({ kind: "msg", text: `${lead}${line.msg}` });
      continue;
    }
    parts.push({
      kind: col.key,
      text: `${lead}${clipPadField(rawField(line, col.key, layout.timeFormat), col.chars, col.align)} `,
    });
  }
  return parts;
}

export function joinLogDoc(parts: readonly LogLinePart[]): string {
  return parts.map((part) => part.text).join("");
}

export function formatLogDoc(line: LogLine, layout: LogDocLayout): string {
  return joinLogDoc(formatLogDocParts(line, layout));
}

export function splitLevelGlyph(text: string): { lead: string; letter: string; pad: string } {
  const letter = text.trim();
  const at = text.indexOf(letter);
  if (!letter || at < 0) {
    return { lead: "", letter: text, pad: "" };
  }
  return { lead: text.slice(0, at), letter, pad: text.slice(at + letter.length) };
}
