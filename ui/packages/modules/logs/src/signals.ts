/**
 * 信号扫描（批内增量，纯函数）：崩溃 / ANR。
 */

import type { LogLine } from "@yohu/api";

export type SignalKind = "crash" | "anr";

export interface SignalHit {
  pid: number;
  kind: SignalKind;
}

const CRASH_RE = /FATAL EXCEPTION|AndroidRuntime|has died/i;
const ANR_RE = /ANR in|not responding|am_anr/i;

export function scanSignal(line: LogLine): SignalHit | null {
  const text = `${line.tag}: ${line.msg}`;
  if (CRASH_RE.test(text)) return { pid: line.pid, kind: "crash" };
  if (ANR_RE.test(text)) return { pid: line.pid, kind: "anr" };
  return null;
}
