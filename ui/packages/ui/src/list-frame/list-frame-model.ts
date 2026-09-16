/**
 * 清单投放框（L2）。
 * 对照 Explorer / Finder / VS Code：投放命中是叠加层，不是行盒描边。
 * 行盒贴齐面板内容；YoCorner clip 与描边吃掉 x=0。框必须缩进后再画。
 * 不碰 DOM、不写色值。
 */

import { Stroke } from "../tokens/layout";

export type YoListFrameVariant = "hot" | "focus";

export interface ListFrameBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 相对行盒内缩，躲开面板 clip / 描边。 */
export function listFrameInset(): number {
  return Stroke.Accent;
}

/** 框描边宽。走 YoCorner hairline 环，不是 CSS border。 */
export function listFrameStroke(): number {
  return Stroke.Hairline;
}

/** 行盒 → 叠加层盒。面积不够则 null。 */
export function listFrameBox(row: ListFrameBox, inset = listFrameInset()): ListFrameBox | null {
  const width = row.width - inset * 2;
  const height = row.height - inset * 2;
  if (width <= 0 || height <= 0) return null;
  return {
    x: row.x + inset,
    y: row.y + inset,
    width,
    height,
  };
}
