/**
 * 堆叠折叠（显示层，纯函数）。
 */

import { scanSignal, type LogLine, type SignalKind } from "@yohu/api";

export interface ViewRow {
  line: LogLine;
  collapsedAfter?: number;
  signal?: SignalKind;
}

/** 堆栈帧。连续折叠和单帧计数都认这一把。 */
export function stackFrameMessage(msg: string): boolean {
  return msg.startsWith("at ");
}

export function collapseStack(lines: readonly LogLine[]): ViewRow[] {
  const rows: ViewRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const signal = scanSignal(line)?.kind;
    if (stackFrameMessage(line.msg)) {
      let j = i + 1;
      while (j < lines.length && stackFrameMessage(lines[j]!.msg)) {
        j++;
      }
      const count = j - i - 1;
      rows.push(count > 0 ? { line, collapsedAfter: count, signal } : { line, signal });
      i = j;
    } else {
      rows.push({ line, signal });
      i++;
    }
  }
  return rows;
}
