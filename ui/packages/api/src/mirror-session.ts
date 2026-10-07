/**
 * 投屏会话词。日志采集相和传输槽位不是这一份。
 * UI 相位的 idle、wire 的 stopped 也不是 live / starting / failed。
 * 后三个词两套类型共用，所以参数是字符串。
 */

import type { MirrorSessionState } from "./types";

export function mirrorIsLive(state: string): boolean {
  return state === "live";
}

export function mirrorIsStarting(state: string): boolean {
  return state === "starting";
}

export function mirrorIsFailed(state: string): boolean {
  return state === "failed";
}

/** 会话已结束：停掉或失败。只认 wire 状态。 */
export function mirrorSessionEnded(state: MirrorSessionState): boolean {
  return state === "stopped" || mirrorIsFailed(state);
}
