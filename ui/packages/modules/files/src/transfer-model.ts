/**
 * 传输作业：发号即出生，进度只补字节。零 DOM / 零 IPC。
 */

import {
  CAPTURE_TRUNCATED,
  EXEC_TIMEOUT,
  PROGRESS_JOIN,
  PUMP_PANIC,
  SHELL_ENDED,
  SHELL_EXEC,
  SHELL_HANDSHAKE,
  SHELL_NO_STDIN,
  SHELL_NO_STDOUT,
  TOOL_UNAVAILABLE,
  alreadyExistsText,
  deviceOfflineText,
  illegalPathText,
  invalidNameText,
  localFailedText,
  localNotFoundText,
  notADirectoryText,
  notAbsoluteText,
  outsideRootText,
  permissionDeniedText,
  readOnlyText,
  readlinkUnparseableText,
  remoteFailedText,
  remoteNotFoundText,
  traversalText,
  isTerminalTransfer,
  transferIsCancelled,
  transferIsDone,
  transferIsFailed,
  transferIsPush,
  transferIsRunning,
  type Direction,
  type TransferFault,
  type TransferProgress,
  type TransferState,
} from "@yohu/api";
import { ratioPercent, trimmedTextPresent, type IconName, type ToastTone, type YoBadgeTone } from "@yohu/ui";

export interface TransferJob {
  id: number;
  direction: Direction;
  name: string;
  bytes: number;
  total?: number;
  state: TransferState;
  fault?: TransferFault;
  speed?: number;
}

/** 终态不可被迟到的 running 覆盖。 */
export function shouldAcceptProgress(
  current: TransferState | undefined,
  incoming: TransferState,
): boolean {
  return !(current !== undefined && isTerminalTransfer(current) && transferIsRunning(incoming));
}

/** 非正总量当作没有总量。百分比、不定进度、下载预期字节都问这里。 */
export function transferKnownTotal(total: number | undefined): number | undefined {
  if (total === undefined || total <= 0) return undefined;
  return total;
}

export function transferPercent(bytes: number, total: number | undefined): number | undefined {
  const known = transferKnownTotal(total);
  if (known === undefined) return undefined;
  return ratioPercent(bytes, known);
}

export function transferIndeterminate(state: TransferState, total: number | undefined): boolean {
  return transferIsRunning(state) && transferKnownTotal(total) === undefined;
}

function successWhenDone(state: TransferState): "success" | undefined {
  if (transferIsDone(state)) return "success";
  return undefined;
}

export function transferTone(state: TransferState): YoBadgeTone {
  const done = successWhenDone(state);
  if (done) return done;
  if (transferIsFailed(state)) return "danger";
  if (transferIsRunning(state)) return "accent";
  return "neutral";
}

export function transferLabel(state: TransferState): string {
  if (transferIsRunning(state)) return "传输中";
  if (transferIsDone(state)) return "完成";
  if (transferIsCancelled(state)) return "已取消";
  return "失败";
}

/** 坞文案：分类 + 路径/serial。不扫 Display，不用路径栏那句「没有这个目录」。 */
export function transferFaultText(fault: TransferFault | undefined): string {
  if (!fault) return "";
  switch (fault.kind) {
    case "path":
      return illegalPathText(fault.path);
    case "not_absolute":
      return notAbsoluteText(fault.path);
    case "traversal":
      return traversalText(fault.path);
    case "invalid_name":
      return invalidNameText(fault.detail);
    case "outside_root":
      return outsideRootText(fault.path);
    case "remote_not_found":
      return remoteNotFoundText(fault.path);
    case "not_a_directory":
      return notADirectoryText(fault.path);
    case "permission_denied":
      return permissionDeniedText(fault.path);
    case "read_only":
      return readOnlyText(fault.path);
    case "already_exists":
      return alreadyExistsText(fault.path);
    case "remote_failed":
      return remoteFailedText(fault.path);
    case "readlink_unparseable":
      return readlinkUnparseableText(fault.path);
    case "local_not_found":
      return localNotFoundText(fault.path);
    case "local":
      return localFailedText(fault.path);
    case "device_offline":
      return deviceOfflineText(fault.serial);
    case "timeout":
      return EXEC_TIMEOUT;
    case "io":
      return "IO 错误";
    case "truncated":
      return CAPTURE_TRUNCATED;
    case "pump_panic":
      return PUMP_PANIC;
    case "shell_no_stdin":
      return SHELL_NO_STDIN;
    case "shell_no_stdout":
      return SHELL_NO_STDOUT;
    case "shell_handshake":
      return SHELL_HANDSHAKE;
    case "shell_ended":
      return SHELL_ENDED;
    case "shell_exec":
      return SHELL_EXEC;
    case "tool_unavailable":
      return TOOL_UNAVAILABLE;
    case "progress_join":
      return PROGRESS_JOIN;
  }
}

export function transferToastTone(state: TransferState): ToastTone {
  const done = successWhenDone(state);
  if (done) return done;
  if (transferIsFailed(state)) return "error";
  return "info";
}

/** 上传用上箭头。方向成员在 @yohu/api。 */
export function transferToastLeading(direction: Direction): IconName {
  return transferIsPush(direction) ? "arrow-up" : "arrow-down";
}

export function transferToastDetail(job: TransferJob): string {
  const fault = transferFaultText(job.fault);
  if (fault) return fault;
  return transferLabel(job.state);
}

export function transferToastProgress(
  job: TransferJob,
): { value?: number; indeterminate?: boolean } | undefined {
  if (!transferIsRunning(job.state)) return undefined;
  return {
    value: transferPercent(job.bytes, job.total),
    indeterminate: transferIndeterminate(job.state, job.total),
  };
}

export function transferFallbackName(direction: Direction, id: number): string {
  return `${transferIsPush(direction) ? "上传" : "下载"} #${id}`;
}

function trimmedJobName(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (text !== undefined && trimmedTextPresent(text)) return text;
  return undefined;
}

export function resolveJobName(
  incoming: string | undefined,
  existing: string | undefined,
  fallback: string,
): string {
  return trimmedJobName(incoming) ?? trimmedJobName(existing) ?? fallback;
}

export function createTransferJob(input: {
  id: number;
  direction: Direction;
  name: string;
  total?: number;
}): TransferJob {
  return {
    id: input.id,
    direction: input.direction,
    name: resolveJobName(input.name, undefined, transferFallbackName(input.direction, input.id)),
    bytes: 0,
    total: input.total,
    state: "running",
  };
}

export function applyProgressToJob(
  job: TransferJob,
  progress: TransferProgress,
  speed?: number,
): TransferJob {
  return {
    ...job,
    bytes: progress.bytes,
    total: progress.total ?? job.total,
    state: progress.state,
    fault: progress.fault,
    speed,
    name: resolveJobName(
      progress.name,
      job.name,
      transferFallbackName(progress.direction, progress.id),
    ),
  };
}
