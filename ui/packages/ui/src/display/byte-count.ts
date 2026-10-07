/**
 * 字节数文案（L2）。文件大小、传输进度、安装包体积共用这一把。
 * B 为整数；KB / MB 一位小数；GB 两位小数。
 */

export function formatByteCount(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
