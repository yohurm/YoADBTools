/**
 * LineBoard：Document.text → 可视行。
 * clip = Soft-Wrap 关：文档已含 hang 空格，超长行不按视口拆。
 * wrap = Soft-Wrap 开：文档无 hang 空格；超长行按视口切到第 0 列。
 * 禁止视口预切进文档、禁止 CSS hang、禁止回调 Formatter。
 */

import { logLineWraps, type LogLine, type LogLineLayout, type SignalKind } from "@yohu/api";

import { extendStored, type ContentBar, type DocMessage, type FormatRange } from "./document";

export type VisualLine = {
  seq: number;
  wrapIndex: number;
  docFrom: number;
  text: string;
  ranges: FormatRange[];
  bar: ContentBar;
  barInk?: string;
  signal?: SignalKind;
  collapsedAfter?: number;
  line: LogLine;
};

const EMPTY_VISUAL: VisualLine[] = [];

function sliceRanges(ranges: readonly FormatRange[], from: number, to: number): FormatRange[] {
  const out: FormatRange[] = [];
  for (const range of ranges) {
    const start = Math.max(range.start, from);
    const end = Math.min(range.end, to);
    if (end <= start) {
      continue;
    }
    out.push({ ...range, start: start - from, end: end - from });
  }
  return out;
}

function lineOf(
  message: DocMessage,
  wrapIndex: number,
  docFrom: number,
  text: string,
  last: boolean,
): VisualLine {
  return {
    seq: message.seq,
    wrapIndex,
    docFrom,
    text,
    ranges: sliceRanges(message.ranges, docFrom, docFrom + text.length),
    bar: message.bar,
    barInk: message.barInk,
    signal: message.signal,
    collapsedAfter: last ? message.collapsedAfter : undefined,
    line: message.line,
  };
}

function hardBreaks(text: string): { text: string; from: number }[] {
  const parts = text.split("\n");
  let offset = 0;
  const last = parts.length - 1;
  return parts.map((part, index) => {
    const from = offset;
    offset += part.length + (index === last ? 0 : 1);
    return { text: part, from };
  });
}

/** 只按文档硬 \\n 切开。hang 已在 Document 空格里。 */
export function documentLines(message: DocMessage): VisualLine[] {
  const parts = hardBreaks(message.text);
  const last = parts.length - 1;
  return parts.map((part, wrapIndex) =>
    lineOf(message, wrapIndex, part.from, part.text, wrapIndex === last),
  );
}

function wrapDocumentLine(text: string, from: number, width: number): { text: string; from: number }[] {
  const w = Math.max(1, Math.floor(width));
  if (text.length === 0) {
    return [{ text: "", from }];
  }
  if (!(w < text.length)) {
    return [{ text, from }];
  }
  const out: { text: string; from: number }[] = [];
  for (let i = 0; i < text.length; i += w) {
    out.push({ text: text.slice(i, i + w), from: from + i });
  }
  return out;
}

/** Soft-Wrap 开：文档行再按视口切，续行第 0 列。 */
export function wrapMessage(message: DocMessage, rowChars: number): VisualLine[] {
  const width = Math.max(1, Math.floor(rowChars) || Number.MAX_SAFE_INTEGER);
  const slices = hardBreaks(message.text).flatMap((part) => wrapDocumentLine(part.text, part.from, width));
  const last = slices.length - 1;
  return slices.length > 0
    ? slices.map((slice, wrapIndex) => lineOf(message, wrapIndex, slice.from, slice.text, wrapIndex === last))
    : [lineOf(message, 0, 0, "", true)];
}

function documentLineChars(line: VisualLine): number {
  return line.text.length;
}

export function documentMaxChars(lines: readonly VisualLine[]): number {
  let max = 0;
  for (const line of lines) {
    max = Math.max(max, documentLineChars(line));
  }
  return max;
}

function maxCharsOf(lines: readonly VisualLine[]): number {
  return documentMaxChars(lines);
}

function projectMessage(message: DocMessage, rowChars: number, layout: LogLineLayout): VisualLine[] {
  return logLineWraps(layout) ? wrapMessage(message, rowChars) : documentLines(message);
}

/** 头部保留尾部：新批次首行在旧批次的偏移。 */
function headOverlap(prev: readonly DocMessage[], next: readonly DocMessage[]): number {
  const firstSeq = next[0]!.seq;
  for (let k = 0; k < prev.length; k += 1) {
    if (prev[k]!.seq === firstSeq) {
      return k;
    }
  }
  return -1;
}

export class LineBoard {
  private messages: readonly DocMessage[] | null = null;
  private rowChars = -1;
  private layout: LogLineLayout = "clip";
  private items: VisualLine[] = EMPTY_VISUAL;
  private maxCharsValue = 0;

  /** 文档最长可视行宽（运行最大值，增删增量维护，不每次扫全表）。 */
  maxChars(): number {
    return this.maxCharsValue;
  }

  project(messages: readonly DocMessage[], rowChars: number, layout: LogLineLayout): VisualLine[] {
    const widthKey = logLineWraps(layout) ? rowChars : 0;
    if (messages === this.messages && widthKey === this.rowChars && layout === this.layout) {
      return this.items;
    }
    if (widthKey !== this.rowChars || layout !== this.layout) {
      this.rowChars = widthKey;
      this.layout = layout;
      this.messages = null;
    }
    if (messages === this.messages) {
      return this.items;
    }
    if (messages.length === 0) {
      this.messages = messages;
      this.items = EMPTY_VISUAL;
      this.maxCharsValue = 0;
      return this.items;
    }
    const prev = this.messages;
    if (prev && prev.length > 0) {
      const evicted = headOverlap(prev, messages);
      const keep = evicted >= 0 ? prev.length - evicted : -1;
      if (
        evicted >= 0 &&
        keep > 0 &&
        keep <= messages.length &&
        prev[prev.length - 1]!.seq === messages[keep - 1]!.seq
      ) {
        const removeCount = evicted > 0 ? this.countVisual(prev, evicted) : 0;
        const removedLines = evicted > 0 ? this.items.slice(0, removeCount) : EMPTY_VISUAL;
        const keptItems = evicted > 0 ? this.items.slice(removeCount) : this.items;
        const oldMax = this.maxCharsValue;
        if (keep === messages.length) {
          this.items = keptItems;
          this.messages = messages;
          this.refreshMaxAfterDrop(removedLines, oldMax);
          return this.items;
        }
        const tail = messages.slice(keep).flatMap((row) => projectMessage(row, this.rowChars, this.layout));
        this.items = evicted > 0 ? keptItems.concat(tail) : extendStored(this.items, EMPTY_VISUAL, tail);
        this.messages = messages;
        this.refreshMaxAfterDrop(removedLines, oldMax);
        this.maxCharsValue = Math.max(this.maxCharsValue, maxCharsOf(tail));
        return this.items;
      }
    }
    this.items = messages.flatMap((row) => projectMessage(row, this.rowChars, this.layout));
    this.messages = messages;
    this.maxCharsValue = maxCharsOf(this.items);
    return this.items;
  }

  /** 旧批次前 n 条消息占多少可视行。 */
  private countVisual(prev: readonly DocMessage[], n: number): number {
    let count = 0;
    for (let i = 0; i < n && count < this.items.length; i += 1) {
      const seq = prev[i]!.seq;
      while (count < this.items.length && this.items[count]!.seq === seq) {
        count += 1;
      }
    }
    return count;
  }

  /** 头部淘汰后更新最长行：只有丢掉的行曾达到旧最大值时才重算。 */
  private refreshMaxAfterDrop(removedLines: readonly VisualLine[], oldMax: number): void {
    if (removedLines.length === 0) {
      return;
    }
    if (maxCharsOf(removedLines) < oldMax) {
      return;
    }
    this.maxCharsValue = maxCharsOf(this.items);
  }
}

export function visualRowKey(row: VisualLine): string {
  return `${row.seq}-${row.wrapIndex}`;
}
