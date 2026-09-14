/**
 * 文件模块异常文案。只信 ipcErrorCode + 已分类 Display。
 * 禁止扫 stderr / 禁止把「不是目录」收成「没有这个目录」。
 */

import { errorText, ipcErrorCode } from "@yohu/api";

export const MISSING_DIR = "没有这个目录，请重新输入";

export function filesFaultText(e: unknown): string {
  const code = ipcErrorCode(e);
  if (code === "not_found") return MISSING_DIR;
  if (code !== undefined) return errorText(e);
  if (e instanceof Error) return e.message;
  return String(e);
}

export function isCancelledError(e: unknown): boolean {
  return ipcErrorCode(e) === "cancelled";
}

export function isNotFoundError(e: unknown): boolean {
  return ipcErrorCode(e) === "not_found";
}
