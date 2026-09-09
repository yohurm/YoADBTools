/**
 * 日志复制（对照 Android Studio Logcat）。
 *
 * 剪贴板只从数据模型重排，禁止 `Selection.toString()`：
 * CSS Grid 各列是独立盒，原生选区会按盒拆成碎片/换行，粘贴即乱码。
 *
 * 自底向上：
 *   L0 formatLogLine（与导出同一 testdata）
 *   L1 视觉选区 → 起止 seq（只认相交行，不读盒内字符）
 *   L2 seq 闭区间 ∩ 当前窗口 visible（补上虚拟列表未挂载的中间行）
 *   L3 序列化 / 拦截 copy 事件（只写 text/plain）
 *
 * Ctrl+A = 整表 visible，不是视口 DOM Range。
 */

import type { LogLine } from "@yohu/api";

import { formatLogLine } from "./format";
import type { ViewRow } from "./stack";

export const LOG_ROW_SEQ_ATTR = "data-seq";

export type LogCopyScope =
  | { kind: "none" }
  | { kind: "all" }
  | { kind: "range"; fromSeq: number; toSeq: number };

export const LOG_COPY_NONE: LogCopyScope = { kind: "none" };

function seqOfHost(host: Element): number | null {
  const raw =
    host.getAttribute(LOG_ROW_SEQ_ATTR) ??
    host.querySelector(`[${LOG_ROW_SEQ_ATTR}]`)?.getAttribute(LOG_ROW_SEQ_ATTR);
  if (raw == null || raw === "") return null;
  const seq = Number(raw);
  return Number.isFinite(seq) ? seq : null;
}

function rowHosts(listRoot: ParentNode): Element[] {
  const virtual = listRoot.querySelectorAll(".yohu-virtual-list__row");
  if (virtual.length > 0) return [...virtual];
  return [...listRoot.querySelectorAll(`.yohu-logs__row[${LOG_ROW_SEQ_ATTR}]`)];
}

function rangeHitsNode(range: Range, node: Node): boolean {
  try {
    if (typeof range.intersectsNode === "function") {
      return range.intersectsNode(node);
    }
  } catch {
    /* jsdom / 跨文档 */
  }
  const doc = node.ownerDocument;
  if (!doc) return false;
  try {
    const nodeRange = doc.createRange();
    nodeRange.selectNode(node);
    return (
      range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
    );
  } catch {
    return false;
  }
}

/** 清单内选区相交行的 seq（DOM 里有的）。两端都在清单外则空。 */
export function intersectingRowSeqs(
  listRoot: ParentNode | null,
  selection: Selection | null = typeof window === "undefined" ? null : window.getSelection(),
): number[] {
  if (!listRoot || !selection || selection.isCollapsed || selection.rangeCount === 0) return [];
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (!anchor || !focus) return [];
  if (!listRoot.contains(anchor) && !listRoot.contains(focus)) return [];
  const range = selection.getRangeAt(0);
  const seen = new Set<number>();
  const seqs: number[] = [];
  for (const host of rowHosts(listRoot)) {
    if (!rangeHitsNode(range, host)) continue;
    const seq = seqOfHost(host);
    if (seq === null || seen.has(seq)) continue;
    seen.add(seq);
    seqs.push(seq);
  }
  return seqs;
}

/** 有相交行则收成 range；否则不改（避免虚拟化卸节点把已记录的区间冲掉）。 */
export function pickFromSelection(
  listRoot: ParentNode | null,
  selection: Selection | null = typeof window === "undefined" ? null : window.getSelection(),
): LogCopyScope | null {
  const seqs = intersectingRowSeqs(listRoot, selection);
  if (seqs.length === 0) return null;
  let fromSeq = seqs[0]!;
  let toSeq = seqs[0]!;
  for (const seq of seqs) {
    if (seq < fromSeq) fromSeq = seq;
    if (seq > toSeq) toSeq = seq;
  }
  return { kind: "range", fromSeq, toSeq };
}

export function linesForCopy(opts: {
  scope: LogCopyScope;
  rows: readonly ViewRow[];
  fallbackLine?: LogLine | null;
}): LogLine[] {
  const { scope, rows, fallbackLine } = opts;
  if (scope.kind === "all") return rows.map((row) => row.line);
  if (scope.kind === "range") {
    const lo = Math.min(scope.fromSeq, scope.toSeq);
    const hi = Math.max(scope.fromSeq, scope.toSeq);
    return rows.filter((row) => row.line.seq >= lo && row.line.seq <= hi).map((row) => row.line);
  }
  return fallbackLine ? [fallbackLine] : [];
}

/** 复制载荷：整行 logcat 文本，与导出同一 `formatLogLine`。 */
export function serializeLogCopy(opts: {
  scope: LogCopyScope;
  rows: readonly ViewRow[];
  fallbackLine?: LogLine | null;
}): string {
  return linesForCopy(opts).map(formatLogLine).join("\n");
}

export function copyHasPayload(opts: {
  scope: LogCopyScope;
  rows: readonly ViewRow[];
  fallbackLine?: LogLine | null;
}): boolean {
  return serializeLogCopy(opts).length > 0;
}

/** 挡住浏览器把 Grid 选区写成 HTML/碎片纯文本。 */
export function applyCopyEvent(event: ClipboardEvent, text: string): boolean {
  if (!text) return false;
  event.preventDefault();
  event.stopPropagation();
  event.clipboardData?.setData("text/plain", text);
  return true;
}
