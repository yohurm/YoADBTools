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
  if (!(listRoot instanceof Node)) {
    return false;
  }
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  return Boolean((anchor && listRoot.contains(anchor)) || (focus && listRoot.contains(focus)));
}

function rowOf(node: Node): HTMLElement | null {
  if (node instanceof HTMLElement && node.matches("[data-seq]")) {
    return node;
  }
  return (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-seq]") ?? null;
}

function rowDocFrom(row: HTMLElement): number {
  const from = Number(row.dataset.docFrom ?? 0);
  return Number.isFinite(from) ? from : 0;
}

/** caret 落在某可视行上时映回 Document {seq, off}。铬带不计长。 */
export function docPointFromCaret(listRoot: ParentNode, node: Node | null, offset: number): DocPoint | null {
  if (!node || !(listRoot instanceof Node) || !listRoot.contains(node)) {
    return null;
  }
  const row = rowOf(node);
  if (!row || !listRoot.contains(row)) {
    return null;
  }
  const seq = Number(row.dataset.seq);
  if (!Number.isFinite(seq)) {
    return null;
  }
  return { seq, off: rowDocFrom(row) + textOffsetInDoc(row, node, offset) };
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
  if (start.seq === end.seq && start.off === end.off) {
    return null;
  }
  return orderDocSel({ start, end });
}

export function docSelCopyText(sel: DocSel, messages: readonly { seq: number; text: string }[]): string {
  const { start, end } = orderDocSel(sel);
  const first = messages.find((item) => item.seq === start.seq);
  const last = messages.find((item) => item.seq === end.seq);
  if (!first || !last) {
    return "";
  }
  if (start.seq === end.seq) {
    const a = Math.min(start.off, end.off);
    const b = Math.max(start.off, end.off);
    return first.text.slice(a, b);
  }
  const middle = messages.filter((item) => item.seq > start.seq && item.seq < end.seq).map((item) => item.text);
  return [first.text.slice(Math.min(start.off, first.text.length)), ...middle, last.text.slice(0, Math.min(Math.max(end.off, 0), last.text.length))].join(
    "\n",
  );
}
