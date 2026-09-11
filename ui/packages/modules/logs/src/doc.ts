/**
 * 清单文档：对照 AS Logcat MessageFormatter → TextAccumulator → Document。
 * 列间空白是 pad 空格，不是 CSS 格子剩余。join(parts) 即选区/复制表面。
 * 消息是 line.msg 原文；冒号只属于导出 compact，不进清单文档。
 * 表头与行共用 logDocColumns 这一把尺：轨道是 (padLeft+chars+gutter)ch。
 * 列垫（YoColFrame list = space-md 左）也在这把尺里，不是表头单独一份 CSS。
 * domain formatLogLine 只给导出，不进这条链。
 */

import { DATETIME_DISPLAY_LEN, type LogDisplayColumns, type LogLine } from "@yohu/api";
import { Spacing } from "@yohu/ui";

import type { LogLinePart } from "./format";
import {
  defaultLogColWidths,
  LOG_COLUMNS,
  visibleLogColumns,
  type LogColKey,
  type LogColWidths,
  type LogMetaColKey,
} from "./layout";

export const DEFAULT_CH_PX = 8;

export interface LogDocLayout {
  display: LogDisplayColumns;
  widths: LogColWidths;
  chPx: number;
}

const MIN_CH: Record<LogMetaColKey, number> = {
  ts: DATETIME_DISPLAY_LEN,
  uid: 8,
  pid: 5,
  tid: 5,
  level: 1,
  tag: 10,
};

export function defaultLogDocLayout(display: LogDisplayColumns): LogDocLayout {
  return { display, widths: defaultLogColWidths(), chPx: DEFAULT_CH_PX };
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

export function fieldChars(px: number, chPx: number, min: number): number {
  return Math.max(min, Math.floor(px / Math.max(chPx, 1)));
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
    const chars = fieldChars(layout.widths[col.key] ?? col.defaultWidth, layout.chPx, MIN_CH[col.key]);
    return {
      key: col.key,
      header: col.header,
      resizeLabel: col.resizeLabel,
      chars,
      padLeft,
      gutter: 1,
      align: alignOf(col.key),
      flex: false,
      minWidthPx: Math.max(col.minWidth, (padLeft + MIN_CH[col.key] + 1) * layout.chPx),
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
 * chPx 变成整行/10，列全部被压到 MIN_CH（表头 PID+级别粘连、Tag 无 pad）。
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

function rawField(line: LogLine, key: LogMetaColKey): string {
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
  const spec = LOG_COLUMNS.find((col) => col.key === key);
  return spec?.align === "end" || key === "uid" || key === "pid" || key === "tid" ? "end" : "start";
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
      text: `${lead}${clipPadField(rawField(line, col.key), col.chars, col.align)} `,
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
