/**
 * 传输作业：发号即出生，进度只补字节。零 DOM / 零 IPC。
 */

import type { TransferFault, TransferProgress, TransferState } from "@yohu/api";

export interface TransferJob {
  id: number;
  direction: "push" | "pull";
  name: string;
  bytes: number;
  total?: number;
  state: TransferState;
  fault?: TransferFault;
  speed?: number;
}

export function isTerminalTransfer(state: TransferState): boolean {
  return state !== "running";
}

/** 终态不可被迟到的 running 覆盖。 */
export function shouldAcceptProgress(
  current: TransferState | undefined,
  incoming: TransferState,
): boolean {
  return !(current !== undefined && isTerminalTransfer(current) && incoming === "running");
}

export function transferPercent(bytes: number, total: number | undefined): number | undefined {
  if (total === undefined || total <= 0) return undefined;
  return Math.min(100, Math.max(0, (bytes / total) * 100));
}

export function transferIndeterminate(state: TransferState, total: number | undefined): boolean {
  return state === "running" && (total === undefined || total <= 0);
}

export function transferTone(state: TransferState): "success" | "danger" | "accent" | "neutral" {
  if (state === "done") return "success";
  if (state === "failed") return "danger";
  if (state === "running") return "accent";
  return "neutral";
}

export function transferLabel(state: TransferState): string {
  if (state === "running") return "传输中";
  if (state === "done") return "完成";
  if (state === "cancelled") return "已取消";
  return "失败";
}

/** 坞文案：分类 + 路径/serial。不扫 Display，不用路径栏那句「没有这个目录」。 */
export function transferFaultText(fault: TransferFault | undefined): string {
  if (!fault) return "";
  switch (fault.kind) {
    case "path":
      return `路径非法: ${fault.path}`;
    case "outside_root":
      return `路径不在安全根内: ${fault.path}`;
    case "remote_not_found":
      return `远端不存在: ${fault.path}`;
    case "not_a_directory":
      return `不是目录: ${fault.path}`;
    case "permission_denied":
      return `没有权限: ${fault.path}`;
    case "read_only":
      return `文件系统只读: ${fault.path}`;
    case "already_exists":
      return `路径已存在: ${fault.path}`;
    case "remote_failed":
      return `远端操作失败: ${fault.path}`;
    case "local_not_found":
      return `本地路径不存在: ${fault.path}`;
    case "local":
      return `本地操作失败: ${fault.path}`;
    case "device_offline":
      return `设备掉线: ${fault.serial}`;
    case "timeout":
      return "执行超时";
    case "io":
      return "IO 错误";
    case "tool_unavailable":
      return "ADB 不可用";
    case "progress_join":
      return "传输进度任务已中断";
  }
}

export function transferToastTone(state: TransferState): "success" | "error" | "info" {
  if (state === "done") return "success";
  if (state === "failed") return "error";
  return "info";
}

export function transferToastLeading(direction: "push" | "pull"): "arrow-up" | "arrow-down" {
  return direction === "push" ? "arrow-up" : "arrow-down";
}

export function transferToastDetail(job: TransferJob): string {
  const fault = transferFaultText(job.fault);
  if (fault) return fault;
  return transferLabel(job.state);
}

export function transferToastProgress(
  job: TransferJob,
): { value?: number; indeterminate?: boolean } | undefined {
  if (job.state !== "running") return undefined;
  return {
    value: transferPercent(job.bytes, job.total),
    indeterminate: transferIndeterminate(job.state, job.total),
  };
}

export function transferFallbackName(direction: "push" | "pull", id: number): string {
  return `${direction === "push" ? "上传" : "下载"} #${id}`;
}

export function resolveJobName(
  incoming: string | undefined,
  existing: string | undefined,
  fallback: string,
): string {
  const next = incoming?.trim();
  if (next) return next;
  const keep = existing?.trim();
  if (keep) return keep;
  return fallback;
}

export function createTransferJob(input: {
  id: number;
  direction: "push" | "pull";
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
