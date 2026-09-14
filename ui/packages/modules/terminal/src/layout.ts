/**
 * 终端模块布局常量。YoDialog 默认宽走 --yohu-layout-dialog-max（400）；
 * 命令管理是三栏整页窗，尺寸留在本模块，不写业务 JSX 魔法数。
 */

import { Density, getDensity, type DensityName } from "@yohu/ui";

export const MANAGER_DIALOG = { width: 960, height: 560 } as const;
export const PARAM_DIALOG_WIDTH = 480;

const CONTROL_HEIGHT: Record<DensityName, number> = {
  compact: Density.Compact.controlHeight,
  comfortable: Density.Comfortable.controlHeight,
};

/** 清单行高跟随当前密度，不写死 Comfortable。 */
export function controlRowHeight(): number {
  return CONTROL_HEIGHT[getDensity()];
}
