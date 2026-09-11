/**
 * 工具栏领域模型（L2）。
 * 铬层与溢出策略是不变式；溢出菜单若出现必须走右键 List 槽位，不另起控件树。
 */

export type ToolbarChrome = "band";
export type ToolbarOverflow = "scroll";
export type ToolbarPad = "band" | "xs";

export const DEFAULT_TOOLBAR_CHROME: ToolbarChrome = "band";
export const DEFAULT_TOOLBAR_OVERFLOW: ToolbarOverflow = "scroll";
export const DEFAULT_TOOLBAR_PAD: ToolbarPad = "band";

export interface ToolbarInput {
  chrome?: ToolbarChrome;
  overflow?: ToolbarOverflow;
  pad?: ToolbarPad;
}

export interface ToolbarSpec {
  chrome: ToolbarChrome;
  overflow: ToolbarOverflow;
  pad: ToolbarPad;
}

export function resolveToolbarSpec(input: ToolbarInput = {}): ToolbarSpec {
  return {
    chrome: input.chrome ?? DEFAULT_TOOLBAR_CHROME,
    overflow: input.overflow ?? DEFAULT_TOOLBAR_OVERFLOW,
    pad: input.pad ?? DEFAULT_TOOLBAR_PAD,
  };
}
