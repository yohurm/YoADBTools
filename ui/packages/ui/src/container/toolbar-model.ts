/**
 * 工具栏领域模型（L2）。
 * 铬由 pad 推导：band = 画布上的独立灰带；xs = 贴栏素底（卡片内 SubHeader，不嵌套 control 圆角）。
 * 两轴只裁切，不画系统条、不 import YoScroller。
 * 溢出菜单若出现必须走右键 List 槽位，不另起控件树。
 */

export type ToolbarChrome = "band" | "plain";
export type ToolbarOverflow = "hidden";
export type ToolbarPad = "band" | "xs";

export const DEFAULT_TOOLBAR_CHROME: ToolbarChrome = "band";
export const DEFAULT_TOOLBAR_OVERFLOW: ToolbarOverflow = "hidden";
export const DEFAULT_TOOLBAR_PAD: ToolbarPad = "band";

export interface ToolbarInput {
  pad?: ToolbarPad;
}

export interface ToolbarSpec {
  chrome: ToolbarChrome;
  overflow: ToolbarOverflow;
  pad: ToolbarPad;
}

export function resolveToolbarSpec(input: ToolbarInput = {}): ToolbarSpec {
  const pad = input.pad ?? DEFAULT_TOOLBAR_PAD;
  return {
    chrome: pad === "xs" ? "plain" : DEFAULT_TOOLBAR_CHROME,
    overflow: DEFAULT_TOOLBAR_OVERFLOW,
    pad,
  };
}
