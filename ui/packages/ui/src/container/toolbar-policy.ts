/**
 * 工具栏交互策略（L3）。
 * 宿主 role / data-* 从模型快照组装。不画铬、不实现第二套 Overflow 菜单。
 */

import {
  resolveToolbarSpec,
  type ToolbarChrome,
  type ToolbarInput,
  type ToolbarOverflow,
  type ToolbarPad,
} from "./toolbar-model";

export interface ToolbarHostAttrs {
  role: "toolbar";
  "data-chrome": ToolbarChrome;
  "data-overflow": ToolbarOverflow;
  "data-pad": ToolbarPad;
}

export function toolbarHostAttrs(input: ToolbarInput = {}): ToolbarHostAttrs {
  const spec = resolveToolbarSpec(input);
  return {
    role: "toolbar",
    "data-chrome": spec.chrome,
    "data-overflow": spec.overflow,
    "data-pad": spec.pad,
  };
}
