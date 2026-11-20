/**
 * Document：对照 AS DocumentAppender。
 * 只尾部追加 / 环裁 / 改选项重载。文本来自官方 Format 分段，本层不垫列、不折行。
 * Soft-Wrap 已在 Formatter 写入（关 hang / 开裸 \\n）。本层只存 Document.text。
 * 格式化只走 Formatter；LogLine / SignalKind 经 ViewRow 模型引入。
 */

import {
  formatColCharsKey,
  formatMessages,
  formatOptionsKey,
  type ContentBar,
  type FormatOptions,
  type FormatRange,
  type FormattedMessage,
} from "./format";
import type { ViewRow } from "../stack";
import { findHeadOverlap } from "../stream/seq";

export type { ContentBar, FormatOptions, FormatRange };

export type DocMessage = {
  seq: number;
  text: string;
  ranges: readonly FormatRange[];
  bar: ContentBar;
  barInk?: string;
  signal?: ViewRow["signal"];
  collapsedAfter?: number;
  line: ViewRow["line"];
};

export const EMPTY_MESSAGES: DocMessage[] = [];
export const EMPTY_ROWS: ViewRow[] = [];

export function extendStored<T>(current: readonly T[], empty: readonly T[], next: T[]): T[] {
  return current === empty ? next : current.concat(next);
}

function toDocMessage(row: ViewRow, formatted: FormattedMessage): DocMessage {
  return {
    seq: row.line.seq,
    text: formatted.text,
    ranges: formatted.ranges,
    bar: formatted.bar,
    barInk: formatted.barInk,
    signal: row.signal,
    collapsedAfter: row.collapsedAfter,
    line: row.line,
  };
}

function paintRows(rows: readonly ViewRow[], options: FormatOptions): DocMessage[] {
  const messages = formatMessages(
    rows.map((row) => row.line),
    options,
  );
  return messages.map((formatted, index) => toDocMessage(rows[index]!, formatted));
}

/** 下一批相对上一批的尾部重排：丢掉头部 k 行、保留重合尾部、追加新尾。 */
type SyncDiff = {
  evicted: number;
  tailStart: number;
};

/** 以 seq 单调为前提求「新批次首行在旧批次里的位置」。找不到即整表替换。 */
function headOverlap(prev: readonly ViewRow[], next: readonly ViewRow[]): number {
  return findHeadOverlap(prev, next, (row) => row.line.seq);
}

/** 计算与旧批次的差分；不可增量时返回 null（调用方 reload）。 */
function syncDiff(prev: readonly ViewRow[], next: readonly ViewRow[]): SyncDiff | null {
  const evicted = headOverlap(prev, next);
  if (evicted < 0) {
    return null;
  }
  const keep = prev.length - evicted;
  if (keep > next.length) {
    return null;
  }
  if (keep > 0 && prev[prev.length - 1]!.line.seq !== next[keep - 1]!.line.seq) {
    return null;
  }
  return { evicted, tailStart: keep };
}

function rowsEmpty(rows: readonly ViewRow[]): boolean {
  return rows.length === 0;
}

export class LogDocument {
  private opts: FormatOptions | null = null;
  private key = "";
  private colKey = "";
  private source: readonly ViewRow[] = EMPTY_ROWS;
  private items: DocMessage[] = EMPTY_MESSAGES;

  get messages(): readonly DocMessage[] {
    return this.items;
  }

  setOptions(next: FormatOptions): boolean {
    const key = formatOptionsKey(next);
    const colKey = formatColCharsKey(next);
    if (this.opts && key === this.key) {
      this.opts = next;
      if (colKey === this.colKey) {
        return false;
      }
      // 列宽提交（拖宽抬起）只重排一次；拖动过程不写 colChars。
      this.colKey = colKey;
      if (this.sourceEmpty()) {
        return false;
      }
      this.reload(this.source);
      return true;
    }
    this.opts = next;
    this.key = key;
    this.colKey = colKey;
    if (this.sourceEmpty()) {
      return false;
    }
    this.reload(this.source);
    return true;
  }

  append(rows: readonly ViewRow[]): boolean {
    if (!this.opts || rowsEmpty(rows)) {
      return false;
    }
    const painted = paintRows(rows, this.opts);
    this.source = this.source === EMPTY_ROWS ? rows.slice() : [...this.source, ...rows];
    this.items = extendStored(this.items, EMPTY_MESSAGES, painted);
    return true;
  }

  evictFront(count: number): boolean {
    if (count <= 0 || this.itemsEmpty()) {
      return false;
    }
    const n = Math.min(count, this.items.length);
    this.source = this.source.slice(n);
    this.items = this.items.slice(n);
    if (this.itemsEmpty()) {
      this.blankStored();
    }
    return true;
  }

  reload(rows: readonly ViewRow[]): boolean {
    if (!this.opts) {
      this.source = rows;
      this.items = EMPTY_MESSAGES;
      return !rowsEmpty(rows);
    }
    if (rowsEmpty(rows)) {
      const changed = this.items !== EMPTY_MESSAGES;
      this.blankStored();
      return changed;
    }
    this.source = rows;
    this.items = paintRows(rows, this.opts);
    return true;
  }

  /**
   * 按 panel 行差分 adopt / append / evict / reload。无突变返回 false。
   * 差分以 seq 单调定位头部淘汰，避免稳态环裁时每批 O(n) 身份比较。
   */
  sync(rows: readonly ViewRow[]): boolean {
    if (!this.opts) {
      this.source = rows;
      return false;
    }
    if (rows === this.source) {
      return false;
    }
    if (rowsEmpty(rows)) {
      return this.reload(rows);
    }
    if (this.sourceEmpty()) {
      return this.reload(rows);
    }
    const diff = syncDiff(this.source, rows);
    if (!diff) {
      return this.reload(rows);
    }
    const { evicted, tailStart } = diff;
    if (evicted > 0) {
      this.evictFront(evicted);
    }
    const tail = rows.slice(tailStart);
    if (tail.length > 0) {
      this.append(tail);
    }
    this.source = rows;
    return evicted > 0 || tail.length > 0;
  }

  clear(): void {
    this.blankStored();
    this.opts = null;
    this.key = "";
    this.colKey = "";
  }

  private sourceEmpty(): boolean {
    return this.source.length === 0;
  }

  private itemsEmpty(): boolean {
    return this.items.length === 0;
  }

  private blankStored(): void {
    this.source = EMPTY_ROWS;
    this.items = EMPTY_MESSAGES;
  }
}
