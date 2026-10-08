/**
 * 与 yohu-files 文件结果句同一份。传输事件只带 kind + 路径，坞引用这里。
 */

export function illegalPathText(path: string): string {
  return `路径非法: ${path}`;
}

export function remoteNotFoundText(path: string): string {
  return `远端不存在: ${path}`;
}

export function notADirectoryText(path: string): string {
  return `不是目录: ${path}`;
}

export function permissionDeniedText(path: string): string {
  return `没有权限: ${path}`;
}

export function readOnlyText(path: string): string {
  return `文件系统只读: ${path}`;
}

export function alreadyExistsText(path: string): string {
  return `路径已存在: ${path}`;
}

export function remoteFailedText(path: string): string {
  return `远端操作失败: ${path}`;
}

export function localNotFoundText(path: string): string {
  return `本地路径不存在: ${path}`;
}

export function localFailedText(path: string): string {
  return `本地操作失败: ${path}`;
}

export function readlinkUnparseableText(path: string): string {
  return `无法识别路径解析结果: ${path}`;
}

export const PROGRESS_JOIN = "传输进度任务已中断";
