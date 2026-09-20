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
  type YoColHeaderTone,
} from "./col-header-model";

export interface ColHeaderHostAttrs {
  "data-align": YoColHeaderAlign;
  "data-tone": YoColHeaderTone;
  "aria-sort": YoColHeaderSort;
  "data-resizing": "" | undefined;
  resizable: boolean;
  edge: boolean;
}

export function colHeaderHostAttrs(
  input: ColHeaderInput & { resizing?: boolean },
): ColHeaderHostAttrs {
  const spec = resolveColHeaderSpec(input);
  return {
    "data-align": spec.align,
    "data-tone": spec.tone,
    "aria-sort": spec.sort,
    "data-resizing": input.resizing ? "" : undefined,
    resizable: spec.resizable,
    edge: spec.edge,
  };
}
