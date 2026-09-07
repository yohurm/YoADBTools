/**
 * 堆叠折叠（显示层，纯函数）。
 */

import type { LogLine } from "@yohu/api";

import { scanSignal, type SignalKind } from "./signals";

export interface ViewRow {
  line: LogLine;
  collapsedAfter?: number;
  signal?: SignalKind;
}

export function collapseStack(lines: readonly LogLine[]): ViewRow[] {
  const rows: ViewRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const signal = scanSignal(line)?.kind;
    if (line.msg.startsWith("at ")) {
      let j = i + 1;
      while (j < lines.length && lines[j]!.msg.startsWith("at ")) {
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
