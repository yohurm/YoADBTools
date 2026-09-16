/**
 * 页壳策略（L3）。
 * 角色 → data-role。设置页不走本组件（page-margin）。
 * 不写色值、不画铬。
 */

import { resolvePageSpec, type YoPageRole } from "./page-model";

export interface PageHostAttrs {
  "data-role": YoPageRole;
}

export function pageHostAttrs(): PageHostAttrs {
  return {
    "data-role": resolvePageSpec().role,
  };
}
