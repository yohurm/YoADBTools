/**
 * 状态栏策略（L3）。
 * 角色 → data-role；左右只读槽，不接受命令带。
 * 不写色值、不画铬。
 */

import { resolveStatusBarSpec, type StatusBarRole } from "./statusbar-model";

export interface StatusBarHostAttrs {
  "data-role": StatusBarRole;
}

export interface StatusBarSlots {
  hasLeft: boolean;
  hasRight: boolean;
}

export function statusbarHostAttrs(): StatusBarHostAttrs {
  return {
    "data-role": resolveStatusBarSpec().role,
  };
}

export function resolveStatusBarSlots(input: { left?: boolean; right?: boolean }): StatusBarSlots {
  return {
    hasLeft: Boolean(input.left),
    hasRight: Boolean(input.right),
  };
}
