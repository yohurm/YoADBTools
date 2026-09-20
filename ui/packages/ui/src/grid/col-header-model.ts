/**
 * 表头列格领域模型（L2）。
 * 对齐与排序缺省是不变式；不碰 DOM、不判定拖宽会话。
 */

export type YoColHeaderAlign = "start" | "end" | "center";
export type YoColHeaderSort = "ascending" | "descending" | "none";
export type YoColHeaderTone = "list" | "document";

export const COL_HEADER_ALIGNS = ["start", "end", "center"] as const;
export const COL_HEADER_SORTS = ["ascending", "descending", "none"] as const;
export const COL_HEADER_TONES = ["list", "document"] as const;

export const DEFAULT_COL_HEADER_ALIGN: YoColHeaderAlign = "start";
export const DEFAULT_COL_HEADER_SORT: YoColHeaderSort = "none";
export const DEFAULT_COL_HEADER_TONE: YoColHeaderTone = "list";

export interface ColHeaderInput {
  align?: string;
  ariaSort?: string;
  tone?: string;
  /** 只画列缝短柄，不拖。文档 4ch 级别列用来跟消息分开。 */
  split?: boolean;
  resizable?: boolean;
  width?: number;
  onWidthChange?: unknown;
}

export interface ColHeaderSpec {
  align: YoColHeaderAlign;
  sort: YoColHeaderSort;
  tone: YoColHeaderTone;
  resizable: boolean;
  /** 右缘有列缝铬（拖条或 mark） */
  edge: boolean;
}

export function resolveColHeaderAlign(align?: string): YoColHeaderAlign {
  if (align === "end" || align === "center") return align;
  return DEFAULT_COL_HEADER_ALIGN;
}

export function resolveColHeaderSort(sort?: string): YoColHeaderSort {
  if (sort === "ascending" || sort === "descending") return sort;
  return DEFAULT_COL_HEADER_SORT;
}

export function resolveColHeaderTone(tone?: string): YoColHeaderTone {
  if (tone === "document") return "document";
  return DEFAULT_COL_HEADER_TONE;
}

/** 未写 align 靠左；未写 ariaSort 为 none。拖条要同时有 resizable、宽和回调。split 只出列缝。 */
export function resolveColHeaderSpec(input: ColHeaderInput): ColHeaderSpec {
  const resizable = Boolean(
    input.resizable && input.onWidthChange !== undefined && input.width !== undefined,
  );
  return {
    align: resolveColHeaderAlign(input.align),
    sort: resolveColHeaderSort(input.ariaSort),
    tone: resolveColHeaderTone(input.tone),
    resizable,
    edge: resizable || Boolean(input.split),
  };
}
