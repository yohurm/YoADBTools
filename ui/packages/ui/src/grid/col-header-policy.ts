/**
 * 表头列格交互策略（L3）。
 * 宿主 data-* / aria-sort 从模型快照组装；拖中只消费视图瞬态。
 * 不写色值、不画铬。
 */

import type { YoListRowTone } from "../list-row/list-row-model";
import {
  resolveColHeaderSpec,
  type ColHeaderInput,
  type YoColHeaderAlign,
  type YoColHeaderSort,
} from "./col-header-model";
import { presenceAttr } from "../dom/flag";

export interface ColHeaderHostAttrs {
  "data-align": YoColHeaderAlign;
  "data-tone": YoListRowTone;
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
    "data-resizing": presenceAttr(input.resizing),
    resizable: spec.resizable,
    edge: spec.edge,
  };
}
