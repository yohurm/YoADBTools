/**
 * 日志信号：崩溃 / ANR。与 yohu-domain::log_signal 同一套 testdata/log_signal.json。
 */

import { containsAsciiIgnoreCase } from "./log-filter";
import type { LogLine } from "./types";

export type SignalKind = "crash" | "anr";

export interface SignalHit {
  pid: number;
  kind: SignalKind;
}

export function scanSignal(line: LogLine): SignalHit | null {
  const text = `${line.tag}: ${line.msg}`;
  if (containsAsciiIgnoreCase(text, "FATAL EXCEPTION")) return { pid: line.pid, kind: "crash" };
  if (containsAsciiIgnoreCase(text, "ANR in") || containsAsciiIgnoreCase(text, "am_anr")) {
    return { pid: line.pid, kind: "anr" };
  }
  return null;
}
