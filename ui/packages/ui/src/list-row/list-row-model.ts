/**
 * 清单行盒（L2）。
 * Family B 数据网格行：直角通栏 + 底。投放框不在本层。
 * 不碰 DOM、不写色值。
 */

export type YoListRowTone = "document" | "list";
export type YoListRowFill = "none" | "selected" | "hot";

export const DEFAULT_LIST_ROW_TONE: YoListRowTone = "document";

export interface ListRowChromeInput {
  selected?: boolean;
  hot?: boolean;
}

export interface ListRowChrome {
  fill: YoListRowFill;
  /** 行盒永远直角。 */
  radius: 0;
}

export function resolveListRowChrome(input: ListRowChromeInput): ListRowChrome {
  const hot = Boolean(input.hot);
  const selected = Boolean(input.selected);
  return {
    fill: hot ? "hot" : selected ? "selected" : "none",
    radius: 0,
  };
}

/** 热态按 key 精确命中；null / undefined 都不热。 */
export function isListRowHot(
  key: string | number,
  hotKey?: string | number | null,
): boolean {
  return hotKey != null && key === hotKey;
}

/**
 * list 行自绘选中底。
 * document 行把单选底交给 YoIndicator fill。
 */
export function listRowOwnsFill(tone: YoListRowTone = DEFAULT_LIST_ROW_TONE): boolean {
  return tone === "list";
}
