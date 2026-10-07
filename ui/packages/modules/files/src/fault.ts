/**
 * 文件模块异常文案。只信 ipcErrorCode + 已分类 Display。
 * 禁止扫 stderr / 禁止把「不是目录」收成「没有这个目录」。
 */

import { errorText, ipcErrorCode } from "@yohu/api";

export const MISSING_DIR = "没有这个目录，请重新输入";

export function filesFaultText(e: unknown): string {
  if (isNotFoundError(e)) return MISSING_DIR;
  return errorText(e);
}

export function isNotFoundError(e: unknown): boolean {
  return ipcErrorCode(e) === "not_found";
}

/** 一条失败：名字加原因。删除和批量上传用同一句式。 */
export function faultLine(label: string, reason: string): string {
  return `${label}: ${reason}`;
}

/** 捕获到异常时，名字加 filesFaultText 拼成一条失败。 */
export function caughtFaultLine(label: string, e: unknown): string {
  return faultLine(label, filesFaultText(e));
}

/** 多条失败收成一条；没有失败就是空串，用来清掉上一条。 */
export function joinFaultLines(lines: readonly string[]): string {
  if (lines.length === 0) return "";
  return lines.join("；");
}
