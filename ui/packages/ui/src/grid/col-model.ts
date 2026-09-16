/**
 * 清单列宽代数（L2）。只出规格、clamp、轨道字符串、列宽写入相位。
 * 宿主是 YoColFrame（L4，写 --yohu-col-tracks）；表头/拖条是 YoColRow / Header / Resizer。
 * 对照：TanStack columnSizing；AG Grid actualWidth + min/max。
 */

import { Spacing } from "../tokens/spacing";

/** 键盘微调一步 = 间距 sm（8vp）。 */
export const COL_RESIZE_STEP = Spacing.Sm;

export interface YoColSpec {
  key: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth?: number;
  /** 吃剩余，右缘不挂拖条 */
  flex?: boolean;
}

export type YoColWidths = Record<string, number>;

/** 列宽写入相位。会话在 L3 col-resize；本类型只描述回调契约。 */
export type ColResizePhase = "start" | "move" | "end";

export function clampColWidth(spec: YoColSpec, px: number): number {
  const max = spec.maxWidth ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(spec.minWidth, px));
}

export function colWidthOf(spec: YoColSpec, widths: YoColWidths): number {
  return clampColWidth(spec, widths[spec.key] ?? spec.defaultWidth);
}

export function defaultColWidths(specs: readonly YoColSpec[]): YoColWidths {
  return Object.fromEntries(specs.map((spec) => [spec.key, spec.defaultWidth]));
}

export function setColWidth(widths: YoColWidths, spec: YoColSpec, px: number): YoColWidths {
  if (spec.flex) return widths;
  const next = clampColWidth(spec, px);
  if (next === colWidthOf(spec, widths)) return widths;
  return { ...widths, [spec.key]: next };
}

export function colTrackTemplate(specs: readonly YoColSpec[], widths: YoColWidths): string {
  return specs
    .map((spec) => {
      const width = colWidthOf(spec, widths);
      return spec.flex ? `minmax(${width}px, 1fr)` : `${width}px`;
    })
    .join(" ");
}

export function nudgeColWidth(width: number, spec: YoColSpec, steps: number): number {
  return clampColWidth(spec, width + steps * COL_RESIZE_STEP);
}
