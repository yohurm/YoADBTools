/**
 * 清单选区模型。对照 Editor SelectionModel：caret 两点 → {seq, off} 闭开区间。
 * 手势是原生 Selection 的 anchor/focus。复制切 Document 偏移；中间未挂载行由 docSelCopyText 补齐。
 */

export type DocPoint = { seq: number; off: number };
export type DocSel = { start: DocPoint; end: DocPoint };
export type SelLine = { seq: number; docFrom: number; text: string };
export type SelBand = { fromCh: number; chars: number };

export function orderDocSel(sel: DocSel): DocSel {
  const a = sel.start;
  const b = sel.end;
  if (a.seq < b.seq || (a.seq === b.seq && a.off <= b.off)) {
    return sel;
  }
  return { start: b, end: a };
}

export function selSlice(line: SelLine, sel: DocSel | "all"): SelBand | null {
  if (sel === "all") {
    if (line.text.length === 0) {
      return null;
    }
    return { fromCh: 0, chars: line.text.length };
  }
  const { start, end } = orderDocSel(sel);
  if (line.seq < start.seq || line.seq > end.seq) {
    return null;
  }
  const lineLo = line.docFrom;
  const lineHi = line.docFrom + line.text.length;
  const docLo = line.seq === start.seq ? start.off : 0;
  const docHi = line.seq === end.seq ? end.off : Number.MAX_SAFE_INTEGER;
  const from = Math.max(lineLo, docLo);
  const to = Math.min(lineHi, docHi);
  if (to <= from) {
    return null;
  }
  return { fromCh: from - line.docFrom, chars: to - from };
}

function nodeIsElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

function elementOf(node: Node): Element | null {
  return nodeIsElement(node) ? node : node.parentElement;
}

function isChrome(node: Node): boolean {
  const el = elementOf(node);
  return Boolean(el?.closest("[data-log-chrome]"));
}

function textNodeLength(node: Node): number {
  return node.textContent?.length ?? 0;
}

function nodeIsText(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE;
}

function textLengthOf(node: Node): number {
  if (isChrome(node)) {
    return 0;
  }
  if (nodeIsText(node)) {
    return textNodeLength(node);
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
      if (nodeIsElement(node) && node.contains(target)) { found = true; }
      return;
    }
    if (nodeIsText(node)) {
      n += textNodeLength(node);
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

function clampIndex(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

export function textOffsetInDoc(rowEl: Element, node: Node, offset: number): number {
  if (!rowEl.contains(node) && rowEl !== node) {
    return 0;
  }
  if (nodeIsText(node)) {
    if (isChrome(node)) {
      return textLengthBefore(rowEl, node);
    }
    const len = textNodeLength(node);
    return textLengthBefore(rowEl, node) + clampIndex(offset, len);
  }
  if (nodeIsElement(node)) {
    let n = rowEl === node ? 0 : textLengthBefore(rowEl, node);
    const max = clampIndex(offset, node.childNodes.length);
    for (let i = 0; i < max; i++) {
      n += textLengthOf(node.childNodes[i]!);
    }
    return n;
  }
  return 0;
}

function rootIsNode(root: ParentNode): root is ParentNode & Node {
  return root instanceof Node;
}

function rootHas(root: Node, node: Node | null): node is Node {
  return node != null && root.contains(node);
}

export function logSelectionInList(listRoot: ParentNode | null, selection: Selection | null): boolean {
  if (!listRoot || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }
  if (!rootIsNode(listRoot)) {
    return false;
  }
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  return rootHas(listRoot, anchor) || rootHas(listRoot, focus);
}

function seqRowMark(): string {
  return "[data-seq]";
}

export function rowOf(node: Node): HTMLElement | null {
  if (node instanceof HTMLElement && node.matches(seqRowMark())) {
    return node;
  }
  return elementOf(node)?.closest<HTMLElement>(seqRowMark()) ?? null;
}

export function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function rowDocFrom(row: HTMLElement): number {
  return finiteOrNull(Number(row.dataset.docFrom ?? 0)) ?? 0;
}

/** caret 落在某可视行上时映回 Document {seq, off}。铬带不计长。 */
export function docPointFromCaret(listRoot: ParentNode, node: Node | null, offset: number): DocPoint | null {
  if (!rootIsNode(listRoot) || !rootHas(listRoot, node)) {
    return null;
  }
  const row = rowOf(node);
  if (!rootHas(listRoot, row)) {
    return null;
  }
  const seq = finiteOrNull(Number(row.dataset.seq));
  if (seq === null) {
    return null;
  }
  return { seq, off: rowDocFrom(row) + textOffsetInDoc(row, node, offset) };
}

function sameSeq(start: DocPoint, end: DocPoint): boolean {
  return start.seq === end.seq;
}

export function readDocSel(listRoot: ParentNode | null, selection: Selection | null): DocSel | null {
  if (!listRoot || !selection || !logSelectionInList(listRoot, selection)) {
    return null;
  }
  const start = docPointFromCaret(listRoot, selection.anchorNode, selection.anchorOffset);
  const end = docPointFromCaret(listRoot, selection.focusNode, selection.focusOffset);
  if (!start || !end) {
    return null;
  }
  if (sameSeq(start, end) && start.off === end.off) {
    return null;
  }
  return orderDocSel({ start, end });
}

function messageBySeq(messages: readonly { seq: number; text: string }[], seq: number): { seq: number; text: string } | undefined {
  return messages.find((item) => item.seq === seq);
}

export function docSelCopyText(sel: DocSel, messages: readonly { seq: number; text: string }[]): string {
  const { start, end } = orderDocSel(sel);
  const first = messageBySeq(messages, start.seq);
  const last = messageBySeq(messages, end.seq);
  if (!first || !last) {
    return "";
  }
  if (sameSeq(start, end)) {
    const a = Math.min(start.off, end.off);
    const b = Math.max(start.off, end.off);
    return first.text.slice(a, b);
  }
  const middle = messages.filter((item) => item.seq > start.seq && item.seq < end.seq).map((item) => item.text);
  return [first.text.slice(Math.min(start.off, first.text.length)), ...middle, last.text.slice(0, clampIndex(end.off, last.text.length))].join(
    "\n",
  );
}
