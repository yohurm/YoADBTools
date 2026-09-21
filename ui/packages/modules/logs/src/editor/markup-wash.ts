/**
 * Markup BACKGROUND：对照 Logcat DocumentAppender + HighlighterTargetArea.EXACT_RANGE。
 * 编辑器把 [from, to) 铺在写这些字的格子上——本行文本节点的 1ch × 行高。
 * 不是第二棵 DOM，不是表头探针，禁止量 Range。
 * `" L "` 三格等宽，字母在中间格。切窗口只换 Document 与本行 CSS 变量。
 */

export type WashCell = {
  from: number;
  to: number;
  fill: string;
};

export type WashPaint = {
  image: string;
  size: string;
  position: string;
};

const EMPTY_PAINT: WashPaint = {
  image: "none",
  size: "0px 100%",
  position: "0 0",
};

/** 闭开 [from, to) 映射到等宽字符格。字母在正中格。 */
export function washGrid(from: number, to: number): { from: number; span: number } | null {
  if (to <= from) {
    return null;
  }
  return { from, span: to - from };
}

/** BACKGROUND 画在文本节点自己的 1ch 格上，对照编辑器 charWidth。 */
export function washPaint(cells: readonly WashCell[]): WashPaint {
  const real = cells.filter((cell) => cell.to > cell.from && cell.fill);
  if (real.length === 0) {
    return EMPTY_PAINT;
  }
  return {
    image: real.map((cell) => `linear-gradient(${cell.fill}, ${cell.fill})`).join(", "),
    size: real.map((cell) => `calc(${cell.to - cell.from} * 1ch) 100%`).join(", "),
    position: real.map((cell) => `calc(${cell.from} * 1ch) 0`).join(", "),
  };
}

const WASH_IMAGE = "--yohu-wash-image";
const WASH_SIZE = "--yohu-wash-size";
const WASH_POSITION = "--yohu-wash-position";

/** 把 BACKGROUND 写进文本节点。回收行只换变量，不留子节点。 */
export function bindWashPaint(host: HTMLElement, cells: readonly WashCell[]): () => void {
  const paint = washPaint(cells);
  host.style.setProperty(WASH_IMAGE, paint.image);
  host.style.setProperty(WASH_SIZE, paint.size);
  host.style.setProperty(WASH_POSITION, paint.position);
  return () => {
    host.style.removeProperty(WASH_IMAGE);
    host.style.removeProperty(WASH_SIZE);
    host.style.removeProperty(WASH_POSITION);
  };
}
