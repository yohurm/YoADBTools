/**
 * 表头列格交互策略（L3）。
 * 宿主 data-* / aria-sort 从模型快照组装；拖中只消费视图瞬态。
 * 不写色值、不画铬。
 */

import {
  resolveColHeaderSpec,
  type ColHeaderInput,
  type YoColHeaderAlign,
  type YoColHeaderSort,
} from "./col-header-model";

export interface ColHeaderHostAttrs {
  "data-align": YoColHeaderAlign;
  "aria-sort": YoColHeaderSort;
  "data-resizing": "" | undefined;
  resizable: boolean;
}

export function colHeaderHostAttrs(
  input: ColHeaderInput & { resizing?: boolean },
): ColHeaderHostAttrs {
  const spec = resolveColHeaderSpec(input);
  return {
    "data-align": spec.align,
    "aria-sort": spec.sort,
    "data-resizing": input.resizing ? "" : undefined,
    resizable: spec.resizable,
  };
}
