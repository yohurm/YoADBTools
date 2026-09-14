/**
 * 文件模块布局。清单行高与日志 controlRowHeight 同池。
 */

import { Density, getDensity, type DensityName } from "@yohu/ui";

const CONTROL_HEIGHT: Record<DensityName, number> = {
  compact: Density.Compact.controlHeight,
  comfortable: Density.Comfortable.controlHeight,
};

export function controlRowHeight(): number {
  return CONTROL_HEIGHT[getDensity()];
}
