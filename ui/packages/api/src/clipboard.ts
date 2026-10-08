/**
 * 写入系统剪贴板。失败句只有「复制失败」，浏览器原文不进这句。
 * 终端、日志、文件都走这一把，再由各自的 toast 显示 reason。
 */

export const CLIPBOARD_WRITE_FAILED = "复制失败";

export type ClipboardWrite = { ok: true } | { ok: false; reason: typeof CLIPBOARD_WRITE_FAILED };

export function clipboardFailureText(result: ClipboardWrite): string | undefined {
  return result.ok ? undefined : result.reason;
}

export async function writeClipboard(text: string): Promise<ClipboardWrite> {
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    return { ok: false, reason: CLIPBOARD_WRITE_FAILED };
  }
}
