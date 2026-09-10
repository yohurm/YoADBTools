/**
 * 信号扫描（批内增量，纯函数）：崩溃 / ANR。
 */

import type { LogLine } from "@yohu/api";

export type SignalKind = "crash" | "anr";

export interface SignalHit {
  pid: number;
  kind: SignalKind;
}

/** 崩溃正文：只要 FATAL EXCEPTION。进程 has died / AndroidRuntime 堆栈行不是崩溃。 */
const CRASH_RE = /FATAL EXCEPTION/i;
/** ANR 正文：只要 ANR in / am_anr。泛化的 not responding 会误伤普通日志。 */
const ANR_RE = /ANR in|am_anr/i;

export function scanSignal(line: LogLine): SignalHit | null {
  const text = `${line.tag}: ${line.msg}`;
  if (CRASH_RE.test(text)) return { pid: line.pid, kind: "crash" };
  if (ANR_RE.test(text)) return { pid: line.pid, kind: "anr" };
  return null;
}
