/**
 * 日志复制：一份文档，一套选区（对照 Logcat Editor / VS Code Output / DevTools Console）。
 *
 * 行视觉是与表头同轨的单元格；复制载荷仍是 `formatLogLine`。
 * 选区偏移：DOM 只计单元格文案，再映射回文档（补上列间空格 / pad）。
 * 虚拟列表未挂载的中间行用文档全文补齐。
 * 铬层（表头、折叠钮）`user-select: none` / `data-log-chrome`，不进选区。
 */

import type { LogDisplayColumns, LogLine } from "@yohu/api";

import { formatLogLine, formatLogLineForDisplay, formatLogLinePartsForDisplay } from "./format";
import { DEFAULT_LOG_DISPLAY_COLUMNS, logLineCellText, visibleLogColumns, type LogColKey } from "./layout";

export type LogCopyScope = { kind: "none" } | { kind: "all" };

export const LOG_COPY_NONE: LogCopyScope = { kind: "none" };
export const LOG_COPY_ALL: LogCopyScope = { kind: "all" };

export interface VisibleCopyRow {
  line: LogLine;
}

export function seqFromTarget(target: EventTarget | null): number | null {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const row = el?.closest<HTMLElement>("[data-seq]");
  const raw = row?.dataset.seq;
  if (!raw) {
    return null;
  }
  const seq = Number(raw);
  return Number.isFinite(seq) ? seq : null;
}

export function copyHasPayload(opts: {
  pick: LogCopyScope;
  selection: Selection | null;
  fallbackLine?: LogLine | null;
}): boolean {
  if (opts.pick.kind === "all") {
    return true;
  }
  if (opts.selection && !opts.selection.isCollapsed && (opts.selection.toString().length ?? 0) > 0) {
    return true;
  }
  return Boolean(opts.fallbackLine);
}

function lineText(line: LogLine, display?: LogDisplayColumns): string {
  return display ? formatLogLineForDisplay(line, display) : formatLogLine(line);
}

/**
 * 复制载荷。Ctrl+A 走整表文档。其余读选区：
 * 单行 = 文档切片；跨行 = 首行切片 + 中间文档行 + 末行切片。
 * 选区空则退回当前行全文。
 */
export function serializeLogCopy(opts: {
  pick: LogCopyScope;
  rows: readonly VisibleCopyRow[];
  listRoot: ParentNode | null;
  selection: Selection | null;
  fallbackLine?: LogLine | null;
  display?: LogDisplayColumns;
}): string {
  if (opts.pick.kind === "all") {
    return opts.rows.map((row) => lineText(row.line, opts.display)).join("\n");
  }
  const fromSelection = documentCopyText(opts.listRoot, opts.selection, opts.rows, opts.display);
  if (fromSelection) {
    return fromSelection;
  }
  return opts.fallbackLine ? lineText(opts.fallbackLine, opts.display) : "";
}

export function applyCopyEvent(event: ClipboardEvent, text: string): boolean {
  if (!text) {
    return false;
  }
  event.preventDefault();
  event.clipboardData?.setData("text/plain", text);
  return true;
}

interface RowHit {
  seq: number;
  el: HTMLElement;
}

function isChrome(node: Node): boolean {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return Boolean(el?.closest("[data-log-chrome]"));
}

function rowContaining(node: Node): HTMLElement | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return el?.closest<HTMLElement>("[data-seq]") ?? null;
}

function rowHits(listRoot: ParentNode, selection: Selection): RowHit[] {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return [];
  }
  const range = selection.getRangeAt(0);
  const hits: RowHit[] = [];
  for (const node of listRoot.querySelectorAll<HTMLElement>("[data-seq]")) {
    if (!range.intersectsNode(node)) {
      continue;
    }
    const seq = Number(node.dataset.seq);
    if (!Number.isFinite(seq)) {
      continue;
    }
    hits.push({ seq, el: node });
  }
  hits.sort((a, b) => a.seq - b.seq);
  return hits;
}

function textLengthOf(node: Node): number {
  if (isChrome(node)) {
    return 0;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.length ?? 0;
  }
  let n = 0;
  for (const child of node.childNodes) {
    n += textLengthOf(child);
  }
  return n;
}

function textLengthBefore(root: Element, target: Node): number {
  let n = 0;
  let found = false;
  const walk = (node: Node): void => {
    if (found) {
      return;
    }
    if (node === target) {
      found = true;
      return;
    }
    if (isChrome(node)) {
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      n += node.textContent?.length ?? 0;
      return;
    }
    for (const child of node.childNodes) {
      walk(child);
      if (found) {
        return;
      }
    }
  };
  walk(root);
  return n;
}

/**
 * 把某单元格内的局部偏移映射到 formatLogLine 文档偏移。
 * padStart 字段：显示「100」对应文档「  100」，映射时补上前导空格。
 */
export function mapLogCellOffsetToDoc(
  line: LogLine,
  display: LogDisplayColumns,
  key: LogColKey,
  local: number,
): number {
  const parts = formatLogLinePartsForDisplay(line, display);
  let partIdx = 0;
  let doc = 0;

  const consumeSeps = (): void => {
    while (parts[partIdx]?.kind === "sep") {
      doc += parts[partIdx]!.text.length;
      partIdx += 1;
    }
  };

  for (const col of visibleLogColumns(display)) {
    consumeSeps();
    const shown = logLineCellText(line, col.key);
    const part = parts[partIdx];
    if (col.key === key) {
      if (part && part.kind === key) {
        const lead = Math.max(0, part.text.length - shown.length);
        return doc + lead + Math.min(Math.max(local, 0), shown.length);
      }
      return doc;
    }
    if (part && part.kind === col.key) {
      doc += part.text.length;
      partIdx += 1;
    }
  }
  consumeSeps();
  return doc;
}

function cellKeyOf(el: Element): LogColKey | null {
  for (const col of ["ts", "uid", "pid", "tid", "level", "tag", "msg"] as const) {
    if (el.classList.contains(`yohu-logs__row-${col}`)) {
      return col;
    }
  }
  return null;
}

/** 选区锚在哪个单元格，就按那一列映射，避免列缝在 DOM 与文档上错位。 */
export function docOffsetInRow(
  line: LogLine,
  display: LogDisplayColumns,
  rowEl: Element,
  node: Node,
  offset: number,
): number {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const cell = el?.closest<HTMLElement>(".yohu-col-cell");
  const key = cell ? cellKeyOf(cell) : null;
  if (!cell || !key || !rowEl.contains(cell)) {
    return mapLogCellOffsetToDoc(line, display, "msg", textOffsetInRow(rowEl, node, offset));
  }
  return mapLogCellOffsetToDoc(line, display, key, textOffsetInRow(cell, node, offset));
}

/** 行内文本偏移：只计单元格节点，跳过折叠钮等铬层。 */
export function textOffsetInRow(rowEl: Element, node: Node, offset: number): number {
  if (!rowEl.contains(node) && rowEl !== node) {
    return 0;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    const len = node.textContent?.length ?? 0;
    return textLengthBefore(rowEl, node) + Math.min(Math.max(offset, 0), len);
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    let n = rowEl === el ? 0 : textLengthBefore(rowEl, el);
    const max = Math.min(Math.max(offset, 0), el.childNodes.length);
    for (let i = 0; i < max; i++) {
      n += textLengthOf(el.childNodes[i]!);
    }
    return n;
  }
  return 0;
}

/**
 * 从选区重建文档文本。中间未挂载行按 seq 用文档全文补齐。
 */
export function documentCopyText(
  listRoot: ParentNode | null,
  selection: Selection | null,
  rows: readonly VisibleCopyRow[],
  display?: LogDisplayColumns,
): string {
  if (!listRoot || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return "";
  }
  const hits = rowHits(listRoot, selection);
  if (hits.length === 0) {
    return "";
  }
  const range = selection.getRangeAt(0);
  const first = hits[0]!;
  const last = hits[hits.length - 1]!;
  const firstLine = rows.find((row) => row.line.seq === first.seq)?.line;
  const lastLine = rows.find((row) => row.line.seq === last.seq)?.line;
  if (!firstLine || !lastLine) {
    return "";
  }

  const firstDoc = lineText(firstLine, display);
  const lastDoc = lineText(lastLine, display);
  const startRow = rowContaining(range.startContainer);
  const endRow = rowContaining(range.endContainer);
  const columns = display ?? DEFAULT_LOG_DISPLAY_COLUMNS;
  const fromOff =
    startRow && Number(startRow.dataset.seq) === first.seq
      ? docOffsetInRow(firstLine, columns, first.el, range.startContainer, range.startOffset)
      : 0;
  const toOff =
    endRow && Number(endRow.dataset.seq) === last.seq
      ? docOffsetInRow(lastLine, columns, last.el, range.endContainer, range.endOffset)
      : lastDoc.length;

  if (first.seq === last.seq) {
    const a = Math.min(fromOff, toOff);
    const b = Math.max(fromOff, toOff);
    return firstDoc.slice(a, b);
  }

  const start = firstDoc.slice(Math.min(fromOff, firstDoc.length));
  const end = lastDoc.slice(0, Math.min(Math.max(toOff, 0), lastDoc.length));
  const middle = rows
    .filter((row) => row.line.seq > first.seq && row.line.seq < last.seq)
    .map((row) => lineText(row.line, display));
  return [start, ...middle, end].join("\n");
}
