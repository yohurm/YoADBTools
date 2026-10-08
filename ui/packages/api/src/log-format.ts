/**
 * 导出文档一行。与 yohu-domain::format_log_line 同一 testdata/format_log_line.json。
 */

import type { LogLine } from "./types";

/** 线程号列宽。pid 与 tid 都是这一档。 */
function padThreadId(value: number): string {
  return String(value).padStart(5);
}

export function formatLogLine(line: LogLine): string {
  const thread = `${padThreadId(line.pid)} ${padThreadId(line.tid)} ${line.level} ${line.tag}: ${line.msg}`;
  const uid = line.uid;
  if (uid !== undefined && uid !== "") {
    return `${line.ts} ${uid.padStart(8)} ${thread}`;
  }
  return `${line.ts} ${thread}`;
}
