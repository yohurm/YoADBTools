/**
 * 揭示槽领域模型（L2）。
 * 布局轴：in 宿主占内容高，out 宿主 0。
 * 绘制轴始终绝对定位；行程中 out 不自裁。
 * 落定后由祖先 `.yohu-travel:not([data-travel])` clip，避免 abspos 撑 scrollHeight。
 * 自己不插 0fr/1fr。不碰 DOM。
 */

export type RevealLayout = "in" | "out";

export function resolveRevealLayout(open: boolean): RevealLayout {
  return open ? "in" : "out";
}
