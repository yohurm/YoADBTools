/**
 * 折叠策略（L3）。
 * 视图只绑 data-open / data-recipe。动画盒是 Collapse 自己的 __content。
 */

import {
  resolveCollapseSpec,
  type CollapseInput,
  type CollapseRecipe,
} from "./collapse-model";

export interface CollapseHostAttrs {
  "data-open": "true" | "false";
  "data-recipe": CollapseRecipe;
}

export function collapseHostAttrs(input: CollapseInput): CollapseHostAttrs {
  const spec = resolveCollapseSpec(input);
  return {
    "data-open": spec.open ? "true" : "false",
    "data-recipe": spec.recipe,
  };
}
