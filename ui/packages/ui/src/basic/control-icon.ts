/**
 * 控件图标像素。sm 用 IconSm，其余用 IconMd。
 * 图标钮和分段钮都认这一把，视图不再回读 data-size 自己换算。
 */

import { Layout } from "../tokens/layout";

/** 控件图标档。图标钮尺寸和分段图示都认这一份。按钮高和分段钮高不是它。 */
export type ControlIconSize = "sm" | "md";

export function controlIconPx(size: ControlIconSize): number {
  return size === "sm" ? Layout.IconSm : Layout.IconMd;
}
