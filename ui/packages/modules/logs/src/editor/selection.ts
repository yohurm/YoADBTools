/**
 * 清单选区模型。手势仍是原生 Selection；绘制与复制都切 Document 偏移。
 * 对照 Editor SelectionModel：{seq, off} 闭开区间，可视行再投影成 ch 带。
 */

export type DocPoint = { seq: number; off: number };
export type DocSel = { start: DocPoint; end: DocPoint };
export type SelLine = { seq: number; docFrom: number; text: string; hang: number };
export type SelBand = { fromCh: number; chars: number; hang: number };

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
    return { fromCh: 0, chars: line.text.length, hang: line.hang };
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
  return { fromCh: from - line.docFrom, chars: to - from, hang: line.hang };
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
  const probe = document.createRange();
  probe.selectNodeContents(node);
  return range.compareBoundaryPoints(Range.END_TO_START, probe) < 0 && range.compareBoundaryPoints(Range.START_TO_END, probe) > 0;
}

function rowOf(node: Node): HTMLElement | null {
  if (node instanceof HTMLElement && node.matches("[data-seq]")) {
    return node;
  }
  return (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-seq]") ?? null;
}

type VisualHit = { seq: number; wrap: number; el: HTMLElement; docFrom: number };

function lineHits(listRoot: ParentNode, selection: Selection): VisualHit[] {
  const range = selection.getRangeAt(0);
  const hits: VisualHit[] = [];
  for (const node of listRoot.querySelectorAll<HTMLElement>("[data-seq]")) {
    if (!rangeHitsNode(range, node)) {
      continue;
    }
    const seq = Number(node.dataset.seq);
    if (!Number.isFinite(seq)) {
      continue;
    }
    hits.push({
      seq,
      wrap: Number(node.dataset.wrap ?? 0),
      el: node,
      docFrom: Number(node.dataset.docFrom ?? 0),
    });
  }
  hits.sort((a, b) => a.seq - b.seq || a.wrap - b.wrap);
  return hits;
}

function logicalOffset(hit: VisualHit, node: Node, offset: number): number {
  const from = Number.isFinite(hit.docFrom) ? hit.docFrom : 0;
  return from + textOffsetInDoc(hit.el, node, offset);
}

function visualEnd(hit: VisualHit): number {
  return (Number.isFinite(hit.docFrom) ? hit.docFrom : 0) + textLengthOf(hit.el);
}

export function readDocSel(
  listRoot: ParentNode | null,
  selection: Selection | null,
  docLen?: (seq: number) => number | undefined,
): DocSel | null {
  if (!listRoot || !selection || !logSelectionInList(listRoot, selection)) {
    return null;
  }
  const hits = lineHits(listRoot, selection);
  if (hits.length === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const first = hits[0]!;
  const last = hits[hits.length - 1]!;
  const startRow = rowOf(range.startContainer);
  const endRow = rowOf(range.endContainer);
  const startHit = hits.find((hit) => hit.el === startRow) ?? first;
  const endHit = hits.find((hit) => hit.el === endRow) ?? last;
  const startOff =
    startRow && Number(startRow.dataset.seq) === first.seq
      ? logicalOffset(startHit, range.startContainer, range.startOffset)
      : 0;
  const endOff =
    endRow && Number(endRow.dataset.seq) === last.seq
      ? logicalOffset(endHit, range.endContainer, range.endOffset)
      : (docLen?.(last.seq) ?? visualEnd(last));
  return orderDocSel({
    start: { seq: first.seq, off: startOff },
    end: { seq: last.seq, off: endOff },
  });
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
