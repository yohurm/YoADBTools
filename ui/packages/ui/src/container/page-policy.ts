/**
 * 页壳策略（L3）。
 * 角色 → data-role / data-pad / data-column。缺省 inset+fill 不写 data。
 * 不写色值、不画铬。
 */

import {
  resolvePageSpec,
  type YoPageColumn,
  type YoPagePad,
  type YoPageRole,
} from "./page-model";

export interface PageHostAttrs {
  "data-role": YoPageRole;
  "data-pad"?: Extract<YoPagePad, "margin">;
  "data-column"?: Extract<YoPageColumn, "measure">;
}

export function pageHostAttrs(role?: YoPageRole): PageHostAttrs {
  const spec = resolvePageSpec(role);
  return {
    "data-role": spec.role,
    ...(spec.pad === "margin" ? { "data-pad": "margin" as const } : {}),
    ...(spec.column === "measure" ? { "data-column": "measure" as const } : {}),
  };
}
