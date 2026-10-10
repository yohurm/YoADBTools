/**
 * 清单行盒（L2）。
 * Family B 数据网格行：直角通栏 + 底。投放框不在本层。
 * 选中底一律行自绘；document 单选半径 chip，list / 多选块缺省直角通栏。
 * 显式 radius=chip 时每项同一圆角（特殊铬 16）。操作清单走 ripple（默认圆角、行间不留缝）。文件清单不走这两条。
 * 不碰 DOM、不写色值。
 */

export type YoListRowTone = "document" | "list";

/** 文档面。虚拟列表流式布局和表头 document 都认这一把。 */
export function listRowToneIsDocument(tone?: string): boolean {
  return tone === "document";
}

/** 列表面。行半径走直角通栏。 */
export function listRowToneIsList(tone?: string): boolean {
  return tone === "list";
}
export type YoListRowFill = "none" | "selected" | "hot";
/** none = 直角通栏；chip = document 单选圆角片；ripple = 默认 Ripple 圆角，铺满行、行间不留缝。 */
export type YoListRowRadius = "none" | "chip" | "ripple";

export const DEFAULT_LIST_ROW_TONE: YoListRowTone = "document";

export interface ListRowChromeInput {
  selected?: boolean;
  hot?: boolean;
  tone?: YoListRowTone;
  selectable?: boolean;
  /** 多选 key 集。未显式 chip 且 size>1 时半径走 none。 */
  selectedKeys?: ReadonlySet<string | number>;
  /**
   * chip：特殊铬 16，画在行内容上。
   * ripple：默认 Ripple 圆角，画在行盒上，行间不留缝。
   * 文件清单不传。
   */
  radius?: "chip" | "ripple";
}

export interface ListRowChrome {
  fill: YoListRowFill;
  radius: YoListRowRadius;
}

/**
 * 选中片由行自绘。显式 chip 每项同一圆角。
 * 否则 list 与 document 多选块走直角通栏；document 可选单选走 chip。
 */
export function resolveListRowRadius(input: ListRowChromeInput = {}): YoListRowRadius {
  if (!input.selectable) return "none";
  if (input.radius === "ripple") return "ripple";
  if (input.radius === "chip") return "chip";
  if (listRowToneIsList(input.tone)) return "none";
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
