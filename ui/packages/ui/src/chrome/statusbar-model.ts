/**
 * 状态栏领域模型（L2）。
 * 只承载只读指标；不是命令带。
 * 不碰 DOM。
 */

export type StatusBarRole = "status";

export const DEFAULT_STATUS_BAR_ROLE: StatusBarRole = "status";

export interface StatusBarSpec {
  role: StatusBarRole;
}

export function resolveStatusBarSpec(): StatusBarSpec {
  return { role: DEFAULT_STATUS_BAR_ROLE };
}
