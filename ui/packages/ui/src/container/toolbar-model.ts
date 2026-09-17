/**
 * 工具栏领域模型（L2）。
 * 铬层与溢出策略是不变式。两轴只裁切，不画系统条、不 import YoScroller。
 * 溢出菜单若出现必须走右键 List 槽位，不另起控件树。
 */

export type ToolbarChrome = "band";
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
  return {
    chrome: DEFAULT_TOOLBAR_CHROME,
    overflow: DEFAULT_TOOLBAR_OVERFLOW,
    pad: input.pad ?? DEFAULT_TOOLBAR_PAD,
  };
}
