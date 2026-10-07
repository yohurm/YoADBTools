/**
 * 本机导出路径。分隔符拼接在 `@yohu/api` `joinHostPath`。
 * 设备 POSIX 路径不走这里。
 */

import { joinHostPath } from "@yohu/api";

export const LOG_EXPORT_FILE = "logcat-export.txt";

export function suggestedExportPath(dir?: string): string {
  if (dir === undefined || dir === "") {
    return LOG_EXPORT_FILE;
  }
  return joinHostPath(dir, LOG_EXPORT_FILE);
}
