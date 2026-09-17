/**
 * 清单行盒（L2）。
 * Family B 数据网格行：直角通栏 + 底。投放框不在本层。
 * document 单选片交给 YoIndicator fill；行上悬浮必须同一 chip 半径。
 * 不碰 DOM、不写色值。
 */

export type YoListRowTone = "document" | "list";
export type YoListRowFill = "none" | "selected" | "hot";
/** none = 直角通栏；chip = 与 fill 滑块同一 --yohu-ripple-radius。 */
export type YoListRowRadius = "none" | "chip";

export const DEFAULT_LIST_ROW_TONE: YoListRowTone = "document";

export interface ListRowChromeInput {
  selected?: boolean;
  hot?: boolean;
  tone?: YoListRowTone;
  selectable?: boolean;
  /** 多选 key 集。提供且 size>1 时行自绘选中底，半径走 none。 */
  selectedKeys?: ReadonlySet<string | number>;
}

export interface ListRowChrome {
  fill: YoListRowFill;
  radius: YoListRowRadius;
}

/**
 * list 行自绘选中底。
 * document 行把单选底交给 YoIndicator fill。
 */
export function listRowOwnsFill(tone: YoListRowTone = DEFAULT_LIST_ROW_TONE): boolean {
  return tone === "list";
}

/**
 * 选中片由滑块画时，行上悬浮/按压必须同一 chip。
 * list、不可选、document 多选块（≥2）走直角通栏。
 */
export function resolveListRowRadius(input: ListRowChromeInput = {}): YoListRowRadius {
  if (!input.selectable) return "none";
  if (listRowOwnsFill(input.tone)) return "none";
  if (input.selectedKeys !== undefined && input.selectedKeys.size > 1) return "none";
  return "chip";
}

export function resolveListRowChrome(input: ListRowChromeInput): ListRowChrome {
  const hot = Boolean(input.hot);
  const selected = Boolean(input.selected);
  return {
    fill: hot ? "hot" : selected ? "selected" : "none",
    radius: resolveListRowRadius(input),
  };
}

/** 热态按 key 精确命中；null / undefined 都不热。 */
export function isListRowHot(
  key: string | number,
  hotKey?: string | number | null,
): boolean {
  return hotKey != null && key === hotKey;
}
