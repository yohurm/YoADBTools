/**
 * 表头列格领域模型（L2）。
 * 对齐与排序缺省是不变式；不碰 DOM、不判定拖宽会话。
 */

export type YoColHeaderAlign = "start" | "end" | "center";
export type YoColHeaderSort = "ascending" | "descending" | "none";

export const COL_HEADER_ALIGNS = ["start", "end", "center"] as const;
export const COL_HEADER_SORTS = ["ascending", "descending", "none"] as const;

export const DEFAULT_COL_HEADER_ALIGN: YoColHeaderAlign = "start";
export const DEFAULT_COL_HEADER_SORT: YoColHeaderSort = "none";

export interface ColHeaderInput {
  align?: string;
  ariaSort?: string;
  resizable?: boolean;
  width?: number;
  onWidthChange?: unknown;
}

export interface ColHeaderSpec {
  align: YoColHeaderAlign;
  sort: YoColHeaderSort;
  resizable: boolean;
}

export function resolveColHeaderAlign(align?: string): YoColHeaderAlign {
  if (align === "end" || align === "center") return align;
  return DEFAULT_COL_HEADER_ALIGN;
}

export function resolveColHeaderSort(sort?: string): YoColHeaderSort {
  if (sort === "ascending" || sort === "descending") return sort;
  return DEFAULT_COL_HEADER_SORT;
}

/** 未写 align 靠左；未写 ariaSort 为 none。拖条要同时有 resizable、宽和回调。 */
export function resolveColHeaderSpec(input: ColHeaderInput): ColHeaderSpec {
  return {
    align: resolveColHeaderAlign(input.align),
    sort: resolveColHeaderSort(input.ariaSort),
    resizable: Boolean(input.resizable && input.onWidthChange !== undefined && input.width !== undefined),
  };
}
