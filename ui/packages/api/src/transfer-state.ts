/** 传输方向和槽位。色调、文案和图标不在这里。 */

import type { Direction, TransferState } from "./types";

export function transferIsRunning(state: TransferState): boolean {
  return state === "running";
}

export function transferIsDone(state: TransferState): boolean {
  return state === "done";
}

export function transferIsFailed(state: TransferState): boolean {
  return state === "failed";
}

export function transferIsCancelled(state: TransferState): boolean {
  return state === "cancelled";
}

/** 终态。迟到的 running 不能覆盖它。 */
export function isTerminalTransfer(state: TransferState): boolean {
  return !transferIsRunning(state);
}

/** 上传。下载是另一面。 */
export function transferIsPush(direction: Direction): boolean {
  return direction === "push";
}
