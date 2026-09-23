/**
 * 清单行盒（L2）。
 * Family B 数据网格行：直角通栏 + 底。投放框不在本层。
 * 选中底一律行自绘；document 单选半径 chip，list / 多选块直角通栏。
 * 不碰 DOM、不写色值。
 */

export type YoListRowTone = "document" | "list";
export type YoListRowFill = "none" | "selected" | "hot";
/** none = 直角通栏；chip = document 单选圆角片。 */
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
 * 选中片由行自绘。list 与 document 多选块走直角通栏；
 * document 可选单选走 chip，与 --yohu-ripple-radius 同族。
 */
export function resolveListRowRadius(input: ListRowChromeInput = {}): YoListRowRadius {
  if (!input.selectable) return "none";
  if (input.tone === "list") return "none";
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
