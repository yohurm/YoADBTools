/**
 * 日志行文本（与 yohu-domain::format_log_line 同一套 testdata/format_log_line.json）。
 */

import type { LogLine } from "@yohu/api";

export function formatLogLine(line: LogLine): string {
  const pid = String(line.pid).padStart(5);
  const tid = String(line.tid).padStart(5);
  if (line.uid !== undefined && line.uid !== "") {
    const uid = line.uid.padStart(8);
    return `${line.ts} ${uid} ${pid} ${tid} ${line.level} ${line.tag}: ${line.msg}`;
  }
  return `${line.ts} ${pid} ${tid} ${line.level} ${line.tag}: ${line.msg}`;
}
