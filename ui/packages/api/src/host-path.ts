/**
 * 本机路径。分隔符从字符串自身推断，不猜操作系统。
 * 设备 POSIX 路径走 `safety` / `path-input`，不要复用这里。
 */

function hostSep(path: string): "\\" | "/" {
  return path.includes("\\") ? "\\" : "/";
}

function stripTail(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

/** 去掉目录尾部分隔符后的最后一段。空路径为空串。 */
export function hostBaseName(path: string): string {
  const trimmed = stripTail(path);
  if (!trimmed) return "";
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

/** 空目录只返回文件名。尾部分隔符不重复。 */
export function joinHostPath(dir: string, name: string): string {
  if (dir === "") return name;
  return `${stripTail(dir)}${hostSep(dir)}${name}`;
}
