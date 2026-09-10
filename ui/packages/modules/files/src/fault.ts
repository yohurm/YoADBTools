/**
 * 文件模块异常文案。优先信 IPC code；旧壳若仍甩 ls stderr，在这里兜底分类。
 * 禁止把「执行失败(退出码 n): ls: ...」原样给用户。
 */

import { errorText, ipcErrorCode } from "@yohu/api";

export const MISSING_DIR = "没有这个目录，请重新输入";

export function classifyRemoteStderr(stderr: string): string | null {
  const text = stderr.toLowerCase();
  if (
    text.includes("no such file")
    || text.includes("does not exist")
    || text.includes("路径不存在")
  ) {
    return MISSING_DIR;
  }
  if (text.includes("not a directory") || text.includes("不是目录")) return MISSING_DIR;
  if (text.includes("permission denied") || text.includes("operation not permitted")) {
    return "没有权限访问该路径";
  }
  if (text.includes("read-only file system")) return "文件系统只读";
  if (text.includes("file exists") || text.includes("already exists")) return "路径已存在";
  return null;
}

export function filesFaultText(e: unknown): string {
  const raw = errorText(e);
  const classified = classifyRemoteStderr(raw);
  if (classified) return classified;
  const code = ipcErrorCode(e);
  if (code === "not_found" && !raw.includes("本地")) return MISSING_DIR;
  return raw;
}
