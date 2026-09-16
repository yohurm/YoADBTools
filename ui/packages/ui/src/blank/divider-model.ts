/**
 * 分隔器领域模型（L2）。
 * 对照 HarmonyOS Divider：分割线 1px、低对比，成组区分。
 * 不碰 DOM。
 */

export type YoDividerOrientation = "horizontal" | "vertical";

export const DEFAULT_DIVIDER_ORIENTATION: YoDividerOrientation = "horizontal";

export function resolveDividerOrientation(
  orientation?: YoDividerOrientation,
): YoDividerOrientation {
  return orientation === "vertical" ? "vertical" : DEFAULT_DIVIDER_ORIENTATION;
}
