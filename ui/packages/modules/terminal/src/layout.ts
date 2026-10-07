/**
 * 终端模块布局常量。YoDialog 默认宽走 --yohu-layout-dialog-max（400）；
 * 命令管理是三栏整页窗，尺寸留在本模块，不写业务 JSX 魔法数。
 *
 * 导入确认是复核单，不是提示框。宽自下而上由三轨相加：
 * 勾选列 + 身份轨（与命令库栏同宽）+ 状态轨（「已在库中」）+ 对话框垫 + 滚动槽。
 * 高自下而上：标题 + 范围一行 + 决策一行 + 一组标题与 8 条命令 + 页脚。
 */

import { controlRowHeight, FontLeading, FontSizes, Layout, Spacing } from "@yohu/ui";

export const MANAGER_DIALOG = { width: 960, height: 560 } as const;
export const PARAM_DIALOG_WIDTH = 480;

const IMPORT_CHECK = Spacing.Lg + Spacing.Xs;
const IMPORT_CAPTION = Math.ceil(FontSizes.Caption * FontLeading.Tight);
const IMPORT_TITLE = Math.ceil(FontSizes.PageTitle * FontLeading.Tight);
/** 滚动区露出一组标题和 8 条；其余组继续滚。 */
const IMPORT_CATALOG_ROWS = 9;
/** 状态轨：四字徽章加内距。 */
const IMPORT_STATUS = Spacing.TwoXl * 2 + Spacing.Sm;

/** 宽不随密度。高里的每一行跟当前控件行高。 */
export function importDialogSize(): { width: number; height: number } {
  const row = controlRowHeight();
  return {
    width:
      Spacing.Xl * 2 +
      IMPORT_CHECK +
      Spacing.Sm +
      Layout.Sidebar +
      Spacing.Sm +
      IMPORT_STATUS +
      Spacing.Lg,
    height:
      Spacing.Md * 2 +
      IMPORT_TITLE +
      IMPORT_CAPTION +
      Spacing.Sm +
      row +
      Spacing.Sm +
      IMPORT_CATALOG_ROWS * row +
      Spacing.Md * 2 +
      row,
  };
}
