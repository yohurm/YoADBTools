/**
 * Document：对照 AS DocumentAppender。
 * 只尾部追加 / 环裁 / 改选项重载。文本来自官方 Format 分段，本层不垫列、不折行。
 * 长文本 clip / wrap 不进本层，只在 EditorView。
 * 只 import Formatter。
 */

import type { LogLine } from "@yohu/api";

import type { SignalKind } from "../signals";
import {
  formatMessage,
  formatOptionsKey,
  type ContentBar,
  type FormatOptions,
  type FormatRange,
  type LogFieldKind,
} from "./format";

export type { ContentBar, FormatOptions, FormatRange, LogFieldKind };

export type DocRow = {
  line: LogLine;
  signal?: SignalKind;
  collapsedAfter?: number;
};

export type DocMessage = {
  seq: number;
  text: string;
  ranges: readonly FormatRange[];
  headerChars: number;
  bar: ContentBar;
  barInk?: string;
  signal?: SignalKind;
  collapsedAfter?: number;
  line: LogLine;
};

export const EMPTY_MESSAGES: DocMessage[] = [];
export const EMPTY_ROWS: DocRow[] = [];

function paintRow(row: DocRow, options: FormatOptions): DocMessage {
  const formatted = formatMessage(row.line, options);
  return {
    seq: row.line.seq,
    text: formatted.text,
    ranges: formatted.ranges,
    headerChars: formatted.headerChars,
    bar: formatted.bar,
    barInk: formatted.barInk,
    signal: row.signal,
    collapsedAfter: row.collapsedAfter,
    line: row.line,
  };
}

function prefixLen(prev: readonly DocRow[], next: readonly DocRow[]): number {
  if (next.length < prev.length) {
    return -1;
  }
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i] !== next[i]) {
      return -1;
    }
  }
  return prev.length;
}

function suffixOffset(prev: readonly DocRow[], next: readonly DocRow[]): number {
  if (prev.length <= next.length) {
    return -1;
  }
  const offset = prev.length - next.length;
  for (let i = 0; i < next.length; i += 1) {
    if (next[i] !== prev[i + offset]) {
      return -1;
    }
  }
  return offset;
}

function overlapLen(prev: readonly DocRow[], next: readonly DocRow[]): number {
  const max = Math.min(prev.length, next.length);
  for (let n = max; n > 0; n -= 1) {
    let ok = true;
    for (let i = 0; i < n; i += 1) {
      if (prev[prev.length - n + i] !== next[i]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return n;
    }
  }
  return 0;
}

export class LogDocument {
  private opts: FormatOptions | null = null;
  private key = "";
  private source: readonly DocRow[] = EMPTY_ROWS;
  private items: DocMessage[] = EMPTY_MESSAGES;

  get options(): FormatOptions | null {
    return this.opts;
  }

  get messages(): readonly DocMessage[] {
    return this.items;
  }

  setOptions(next: FormatOptions): boolean {
    const key = formatOptionsKey(next);
    if (this.opts && key === this.key) {
      this.opts = next;
      return false;
    }
    this.opts = next;
    this.key = key;
    if (this.source.length === 0) {
      return false;
    }
    this.reload(this.source);
    return true;
  }

  append(rows: readonly DocRow[]): boolean {
    if (!this.opts || rows.length === 0) {
      return false;
    }
    const painted = rows.map((row) => paintRow(row, this.opts!));
    this.source = this.source === EMPTY_ROWS ? rows.slice() : [...this.source, ...rows];
    this.items = this.items === EMPTY_MESSAGES ? painted : this.items.concat(painted);
    return true;
  }

  evictFront(count: number): boolean {
    if (count <= 0 || this.items.length === 0) {
      return false;
    }
    const n = Math.min(count, this.items.length);
    this.source = this.source.slice(n);
    this.items = this.items.slice(n);
    if (this.items.length === 0) {
      this.source = EMPTY_ROWS;
      this.items = EMPTY_MESSAGES;
    }
    return true;
  }

  reload(rows: readonly DocRow[]): boolean {
    if (!this.opts) {
      this.source = rows;
      this.items = EMPTY_MESSAGES;
      return rows.length === 0 && this.items === EMPTY_MESSAGES ? false : true;
    }
    if (rows.length === 0) {
      const changed = this.items !== EMPTY_MESSAGES;
      this.source = EMPTY_ROWS;
      this.items = EMPTY_MESSAGES;
      return changed;
    }
    this.source = rows;
    this.items = rows.map((row) => paintRow(row, this.opts!));
    return true;
  }

  /** 按 panel 行差分 adopt / append / evict / reload。无突变返回 false。 */
  sync(rows: readonly DocRow[]): boolean {
    if (!this.opts) {
      this.source = rows;
      return false;
    }
    if (rows === this.source) {
      return false;
    }
    if (rows.length === 0) {
      return this.reload(rows);
    }
    if (this.source.length === 0) {
      return this.reload(rows);
    }
    const prefixed = prefixLen(this.source, rows);
    if (prefixed >= 0) {
      if (prefixed === rows.length) {
        this.source = rows;
        return false;
      }
      const changed = this.append(rows.slice(prefixed));
      this.source = rows;
      return changed;
    }
    const evicted = suffixOffset(this.source, rows);
    if (evicted > 0) {
      const changed = this.evictFront(evicted);
      this.source = rows.length === 0 ? EMPTY_ROWS : rows;
      return changed;
    }
    const overlap = overlapLen(this.source, rows);
    if (overlap > 0) {
      this.evictFront(this.source.length - overlap);
      const tail = rows.slice(overlap);
      if (tail.length > 0) {
        this.append(tail);
      }
      this.source = rows;
      return true;
    }
    return this.reload(rows);
  }

  clear(): void {
    this.source = EMPTY_ROWS;
    this.items = EMPTY_MESSAGES;
    this.opts = null;
    this.key = "";
  }
}
