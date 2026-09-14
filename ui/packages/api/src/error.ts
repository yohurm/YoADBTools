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

export function errorText(e: unknown): string {
  return decodeIpcError(e).message;
}
