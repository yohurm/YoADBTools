/**
 * 本机宿主路径拼接。分隔符从 dir 自身推断，不猜 OS。
 * 设备 POSIX 路径走 files 模块 joinPath，不要复用这里。
 */

export const LOG_EXPORT_FILE = "logcat-export.txt";

export function joinHostPath(dir: string, name: string): string {
  if (dir === "") {
    return name;
  }
  const sep = dir.includes("\\") ? "\\" : "/";
  const base = dir.replace(/[\\/]+$/, "");
  return `${base}${sep}${name}`;
}

export function suggestedExportPath(dir?: string): string {
  if (dir === undefined || dir === "") {
    return LOG_EXPORT_FILE;
  }
  return joinHostPath(dir, LOG_EXPORT_FILE);
}
