/**
 * 导出 testdata 切段。join === @yohu/api `formatLogLine`（镜像 domain）。
 * 清单 / 选区走 editor Document.text，不走这里。
 */

import { formatLogLine } from "@yohu/api";
import type { LogLine } from "@yohu/api";

export { formatLogLine };

export type LogLinePartKind = "ts" | "uid" | "pid" | "tid" | "level" | "tag" | "msg" | "sep";

export interface LogLinePart {
  kind: LogLinePartKind;
  text: string;
}

export function joinLogLineParts(parts: readonly LogLinePart[]): string {
  return parts.map((part) => part.text).join("");
}

/** 完整 testdata 文档段；`join` === `formatLogLine`。 */
export function formatLogLineParts(line: LogLine): LogLinePart[] {
  const parts: LogLinePart[] = [];
  const pushSep = (): void => {
    if (parts.length > 0) {
      parts.push({ kind: "sep", text: " " });
    }
  };
  parts.push({ kind: "ts", text: line.ts });
  const uid = line.uid;
  if (uid !== undefined && uid !== "") {
    pushSep();
    parts.push({ kind: "uid", text: uid.padStart(8) });
  }
  pushSep();
  parts.push({ kind: "pid", text: String(line.pid).padStart(5) });
  pushSep();
  parts.push({ kind: "tid", text: String(line.tid).padStart(5) });
  pushSep();
  parts.push({ kind: "level", text: line.level });
  pushSep();
  parts.push({ kind: "tag", text: line.tag });
  parts.push({ kind: "sep", text: ": " });
  parts.push({ kind: "msg", text: line.msg });
  return parts;
}
