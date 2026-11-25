/**
 * 折叠策略（L3）。
 * 视图只绑 data-open / data-recipe / data-axis。动画盒是 Collapse 自己的 __content。
 */

import { flagAttr, type FlagAttr } from "../../../dom/flag";
import type { LogicalAxis } from "../../../placement/axis";
import {
  resolveCollapseFlex,
  resolveCollapseSpec,
  type CollapseFlex,
  type CollapseInput,
  type CollapseRecipe,
} from "./collapse-model";

export interface CollapseHostAttrs {
  "data-open": FlagAttr;
  "data-recipe": CollapseRecipe;
  "data-axis": LogicalAxis;
  "data-flex"?: CollapseFlex;
}

export function collapseHostAttrs(input: CollapseInput): CollapseHostAttrs {
  const spec = resolveCollapseSpec(input);
  const flex = resolveCollapseFlex(input.flex);
  return {
    "data-open": flagAttr(spec.open),
    "data-recipe": spec.recipe,
    "data-axis": spec.axis,
    ...(flex ? { "data-flex": flex } : {}),
  };
}
