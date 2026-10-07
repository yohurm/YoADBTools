/**
 * @yohu/api — invoke 失败一次解码为 IpcError { code, message }。
 * 壳 Result<T, IpcError> 到前端就是这个对象，不再嗅 string / {message}。
 */

import type { IpcError, IpcErrorCode } from "./types";

const CODES: ReadonlySet<IpcErrorCode> = new Set([
  "invalid_args",
  "device_offline",
  "unauthorized",
  "adb_error",
  "not_found",
  "cancelled",
  "internal",
]);

function isIpcErrorCode(code: string): code is IpcErrorCode {
  return CODES.has(code as IpcErrorCode);
}

function readIpcError(e: unknown): IpcError | undefined {
  if (!e || typeof e !== "object") return undefined;
  const { code, message } = e as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || typeof message !== "string" || !isIpcErrorCode(code)) {
    return undefined;
  }
  return { code, message };
}

export function decodeIpcError(e: unknown): IpcError {
  const rec = readIpcError(e);
  if (!rec) {
    throw new TypeError("IPC 错误不是 IpcError { code, message }");
  }
  return rec;
}

export function ipcErrorCode(e: unknown): IpcErrorCode | undefined {
  return readIpcError(e)?.code;
}

/** 调用方取消。浏览和采集都认这一把，不把取消句弹成错误。 */
export function isCancelledError(e: unknown): boolean {
  return ipcErrorCode(e) === "cancelled";
}

export function errorText(e: unknown): string {
  return decodeIpcError(e).message;
}

/** 设置保存和截图落盘失败。错误句本身不带这个动作。 */
export function saveFailedText(detail: string): string {
  return `保存失败: ${detail}`;
}

/** 与领域 `device_offline_text` 同一句。事件只带 serial 时用这一份。 */
export function deviceOfflineText(serial: string): string {
  return `设备掉线: ${serial}`;
}

/** 与宿主 `EXEC_TIMEOUT` 同一句。 */
export const EXEC_TIMEOUT = "执行超时";
/** 与宿主 `CAPTURE_TRUNCATED` 同一句。 */
export const CAPTURE_TRUNCATED = "输出超过捕获预算";
/** 与宿主 `PUMP_PANIC` 同一句。 */
export const PUMP_PANIC = "输出泵任务异常结束";
/** 与领域 `TOOL_UNAVAILABLE` 同一句。 */
export const TOOL_UNAVAILABLE = "ADB 不可用";
/** 与领域 `SHELL_*` 同一句。 */
export const SHELL_NO_STDIN = "浏览 shell 无 stdin";
export const SHELL_NO_STDOUT = "浏览 shell 无 stdout";
export const SHELL_HANDSHAKE = "浏览 shell 握手失败";
export const SHELL_ENDED = "浏览 shell 已结束";
export const SHELL_EXEC = "浏览 shell exec 失败";
