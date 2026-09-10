/**
 * 清单复制：DOM 文本 === formatLogDoc。对照 Logcat 默认 Ctrl+C = Document 切片。
 * 跨行中间未挂载行用同一文档补齐，不读格子 innerText。
 */

import type { LogLine } from "@yohu/api";

import { formatLogDoc, type LogDocLayout } from "./doc";

export type LogCopyScope = { kind: "none" } | { kind: "all" };
export type VisibleCopyRow = { line: LogLine };

export const LOG_COPY_NONE: LogCopyScope = { kind: "none" };
export const LOG_COPY_ALL: LogCopyScope = { kind: "all" };

export function seqFromTarget(target: EventTarget | null): number | null {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const raw = el?.closest<HTMLElement>("[data-seq]")?.dataset.seq;
  if (!raw) {
    return null;
  }
  const seq = Number(raw);
  return Number.isFinite(seq) ? seq : null;
}

function isChrome(node: Node): boolean {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return Boolean(el?.closest("[data-log-chrome]"));
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
      if (node === target || (node instanceof Element && node.contains(target))) {
        found = true;
      }
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

export function textOffsetInDoc(rowEl: Element, node: Node, offset: number): number {
  if (!rowEl.contains(node) && rowEl !== node) {
    return 0;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    if (isChrome(node)) {
      return textLengthBefore(rowEl, node);
    }
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

export function logSelectionInList(listRoot: ParentNode | null, selection: Selection | null): boolean {
  if (!listRoot || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }
  const node = selection.anchorNode;
  return Boolean(node && listRoot instanceof Node && listRoot.contains(node));
}

function rangeHitsNode(range: Range, node: Node): boolean {
  if (typeof range.intersectsNode === "function") {
    try {
      return range.intersectsNode(node);
    } catch {
      // jsdom 部分实现会抛；退回边界比较。
    }
  }
  const probe = document.createRange();
  probe.selectNodeContents(node);
  return range.compareBoundaryPoints(Range.END_TO_START, probe) < 0 && range.compareBoundaryPoints(Range.START_TO_END, probe) > 0;
}

export function copyHasPayload(opts: {
  pick: LogCopyScope;
  listRoot: ParentNode | null;
  selection: Selection | null;
  fallbackLine?: LogLine | null;
}): boolean {
  if (opts.pick.kind === "all") {
    return true;
  }
  if (logSelectionInList(opts.listRoot, opts.selection)) {
    return true;
  }
  return Boolean(opts.fallbackLine);
}

function lineHits(listRoot: ParentNode, selection: Selection): { seq: number; el: HTMLElement }[] {
  const range = selection.getRangeAt(0);
  const hits: { seq: number; el: HTMLElement }[] = [];
  for (const node of listRoot.querySelectorAll<HTMLElement>("[data-seq]")) {
    if (!rangeHitsNode(range, node)) {
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

export function documentCopyText(
  listRoot: ParentNode | null,
  selection: Selection | null,
  rows: readonly VisibleCopyRow[],
  layout: LogDocLayout,
): string {
  if (!listRoot || !selection || !logSelectionInList(listRoot, selection)) {
    return "";
  }
  const hits = lineHits(listRoot, selection);
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
  const firstDoc = formatLogDoc(firstLine, layout);
  const lastDoc = formatLogDoc(lastLine, layout);
  const startRow = range.startContainer.parentElement?.closest<HTMLElement>("[data-seq]") ?? null;
  const endRow = range.endContainer.parentElement?.closest<HTMLElement>("[data-seq]") ?? null;
  const fromOff =
    startRow && Number(startRow.dataset.seq) === first.seq
      ? textOffsetInDoc(first.el, range.startContainer, range.startOffset)
      : 0;
  const toOff =
    endRow && Number(endRow.dataset.seq) === last.seq
      ? textOffsetInDoc(last.el, range.endContainer, range.endOffset)
      : lastDoc.length;
  if (first.seq === last.seq) {
    const a = Math.min(fromOff, toOff);
    const b = Math.max(fromOff, toOff);
    return firstDoc.slice(a, b);
  }
  const middle = rows
    .filter((row) => row.line.seq > first.seq && row.line.seq < last.seq)
    .map((row) => formatLogDoc(row.line, layout));
  return [firstDoc.slice(Math.min(fromOff, firstDoc.length)), ...middle, lastDoc.slice(0, Math.min(Math.max(toOff, 0), lastDoc.length))].join(
    "\n",
  );
}

export function serializeLogCopy(opts: {
  pick: LogCopyScope;
  rows: readonly VisibleCopyRow[];
  listRoot: ParentNode | null;
  selection: Selection | null;
  fallbackLine?: LogLine | null;
  layout: LogDocLayout;
}): string {
  if (opts.pick.kind === "all") {
    return opts.rows.map((row) => formatLogDoc(row.line, opts.layout)).join("\n");
  }
  const fromSelection = documentCopyText(opts.listRoot, opts.selection, opts.rows, opts.layout);
  if (fromSelection) {
    return fromSelection;
  }
  return opts.fallbackLine ? formatLogDoc(opts.fallbackLine, opts.layout) : "";
}

export function applyCopyEvent(event: ClipboardEvent, text: string): boolean {
  if (!text) {
    return false;
  }
  event.preventDefault();
  event.clipboardData?.setData("text/plain", text);
  return true;
}
