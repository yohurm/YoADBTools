/**
 * 折叠策略（L3）。
 * 视图只绑 data-open / data-recipe。动画盒是 Collapse 自己的 __content。
 */

import { flagAttr, type FlagAttr } from "../../../dom/flag";
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
  "data-flex"?: CollapseFlex;
}

export function collapseHostAttrs(input: CollapseInput): CollapseHostAttrs {
  const spec = resolveCollapseSpec(input);
  const flex = resolveCollapseFlex(input.flex);
  return {
    "data-open": flagAttr(spec.open),
    "data-recipe": spec.recipe,
    ...(flex ? { "data-flex": flex } : {}),
  };
}
