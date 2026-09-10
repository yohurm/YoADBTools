/**
 * 导出文档：与 `yohu-domain::format_log_line` 同一 testdata。
 * 清单选区 / 列表复制走 `doc.ts` 的 formatLogDoc，不走这里。
 */

import type { LogDisplayColumns, LogLine } from "@yohu/api";

export type LogLinePartKind = "ts" | "uid" | "pid" | "tid" | "level" | "tag" | "msg" | "sep";

export interface LogLinePart {
  kind: LogLinePartKind;
  text: string;
}

/** 完整文档列（与 `formatLogLine` / domain testdata 对齐），不是应用默认显示列。 */
export const ALL_LOG_DISPLAY_COLUMNS: LogDisplayColumns = {
  ts: true,
  uid: true,
  pid: true,
  tid: true,
  level: true,
  tag: true,
};

export function formatLogLine(line: LogLine): string {
  return joinLogLineParts(formatLogLineParts(line));
}

export function joinLogLineParts(parts: readonly LogLinePart[]): string {
  return parts.map((part) => part.text).join("");
}

/** 完整文档段；`join` === `formatLogLine`。 */
export function formatLogLineParts(line: LogLine): LogLinePart[] {
  return formatLogLinePartsForDisplay(line, ALL_LOG_DISPLAY_COLUMNS);
}

/** 按显示列裁文档。关某列则整段（含两侧空格）不进文档。消息始终在。 */
export function formatLogLineForDisplay(line: LogLine, display: LogDisplayColumns): string {
  return joinLogLineParts(formatLogLinePartsForDisplay(line, display));
}

export function formatLogLinePartsForDisplay(line: LogLine, display: LogDisplayColumns): LogLinePart[] {
  const parts: LogLinePart[] = [];
  const pushSep = (): void => {
    if (parts.length > 0) {
      parts.push({ kind: "sep", text: " " });
    }
  };
  if (display.ts) {
    parts.push({ kind: "ts", text: line.ts });
  }
  const uid = line.uid;
  if (display.uid && uid !== undefined && uid !== "") {
    pushSep();
    parts.push({ kind: "uid", text: uid.padStart(8) });
  }
  if (display.pid) {
    pushSep();
    parts.push({ kind: "pid", text: String(line.pid).padStart(5) });
  }
  if (display.tid) {
    pushSep();
    parts.push({ kind: "tid", text: String(line.tid).padStart(5) });
  }
  if (display.level) {
    pushSep();
    parts.push({ kind: "level", text: line.level });
  }
  if (display.tag) {
    pushSep();
    parts.push({ kind: "tag", text: line.tag });
    parts.push({ kind: "sep", text: ": " });
  } else if (parts.length > 0) {
    parts.push({ kind: "sep", text: " " });
  }
  parts.push({ kind: "msg", text: line.msg });
  return parts;
}
