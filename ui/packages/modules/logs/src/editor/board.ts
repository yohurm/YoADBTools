/**
 * LineBoard：Document.text → 可视行。
 * clip = Soft-Wrap 关：文档已含 hang 空格，超长行不按视口拆。
 * wrap = Soft-Wrap 开：文档无 hang 空格；超长行按视口切到第 0 列。
 * 禁止视口预切进文档、禁止 CSS hang、禁止回调 Formatter。
 */

import type { LogLine, LogLineLayout, SignalKind } from "@yohu/api";

import type { ContentBar, DocMessage, FormatRange } from "./document";

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

/** 只按文档硬 \\n 切开。hang 已在 Document 空格里。 */
export function documentLines(message: DocMessage): VisualLine[] {
  const parts = message.text.split("\n");
  let offset = 0;
  const last = parts.length - 1;
  return parts.map((text, wrapIndex) => {
    const row = lineOf(message, wrapIndex, offset, text, wrapIndex === last);
    offset += text.length + (wrapIndex === last ? 0 : 1);
    return row;
  });
}

export function clipMessage(message: DocMessage): VisualLine[] {
  return documentLines(message);
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
  const rows: VisualLine[] = [];
  const parts = message.text.split("\n");
  let offset = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    const slices = wrapDocumentLine(part, offset, width);
    for (const slice of slices) {
      rows.push(lineOf(message, rows.length, slice.from, slice.text, false));
    }
    offset += part.length + (i === parts.length - 1 ? 0 : 1);
  }
  if (rows.length > 0) {
    rows[rows.length - 1] = { ...rows[rows.length - 1]!, collapsedAfter: message.collapsedAfter };
  }
  return rows.length > 0 ? rows : [lineOf(message, 0, 0, "", true)];
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

function projectMessage(message: DocMessage, rowChars: number, layout: LogLineLayout): VisualLine[] {
  return layout === "wrap" ? wrapMessage(message, rowChars) : clipMessage(message);
}

export class LineBoard {
  private messages: readonly DocMessage[] | null = null;
  private rowChars = -1;
  private layout: LogLineLayout = "clip";
  private items: VisualLine[] = EMPTY_VISUAL;

  project(messages: readonly DocMessage[], rowChars: number, layout: LogLineLayout): VisualLine[] {
    const widthKey = layout === "wrap" ? rowChars : 0;
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
      return this.items;
    }
    if (
      this.messages &&
      messages.length >= this.messages.length &&
      this.messages.every((row, i) => row === messages[i])
    ) {
      if (messages.length === this.messages.length) {
        this.messages = messages;
        return this.items;
      }
      const tail = messages
        .slice(this.messages.length)
        .flatMap((row) => projectMessage(row, this.rowChars, this.layout));
      this.items = this.items === EMPTY_VISUAL ? tail : this.items.concat(tail);
      this.messages = messages;
      return this.items;
    }
    if (
      this.messages &&
      this.messages.length > messages.length &&
      messages.every((row, i) => row === this.messages![this.messages!.length - messages.length + i])
    ) {
      const drop = this.messages.length - messages.length;
      let remove = 0;
      for (let i = 0; i < drop; i += 1) {
        const seq = this.messages[i]!.seq;
        while (remove < this.items.length && this.items[remove]!.seq === seq) {
          remove += 1;
        }
      }
      this.items = this.items.slice(remove);
      this.messages = messages;
      return this.items;
    }
    this.items = messages.flatMap((row) => projectMessage(row, this.rowChars, this.layout));
    this.messages = messages;
    return this.items;
  }
}

export function visualRowKey(row: VisualLine): string {
  return `${row.seq}-${row.wrapIndex}`;
}
