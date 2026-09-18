/**
 * 导出文档一行。与 yohu-domain::format_log_line 同一 testdata/format_log_line.json。
 */

import type { LogLine } from "./types";

export function formatLogLine(line: LogLine): string {
  const uid = line.uid;
  if (uid !== undefined && uid !== "") {
    return `${line.ts} ${uid.padStart(8)} ${String(line.pid).padStart(5)} ${String(line.tid).padStart(5)} ${line.level} ${line.tag}: ${line.msg}`;
  }
  return `${line.ts} ${String(line.pid).padStart(5)} ${String(line.tid).padStart(5)} ${line.level} ${line.tag}: ${line.msg}`;
}
