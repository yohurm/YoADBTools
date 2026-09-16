/**
 * 圆角绘制模块。L5 只转发 YoCorner / CornerPillRadius，不转发路径函数。
 */
export { YoCorner } from "./Corner";
export type { YoCornerProps } from "./Corner";
export {
  CornerPillRadius,
  clampCornerRadii,
  cornerRadiusForRole,
  cornerStrokeRingPath,
  cssCornerPath,
  formatCornerCoord,
  insetCornerRadii,
  mergeCornerRadii,
  pointInRoundedRect,
  resolveCornerPaint,
  roundedRectPath,
  roundedRectPathCcw,
  uniformCornerRadii,
} from "./corner-model";
export type { CornerPaint, CornerPaintInput, CornerRadii, CornerRole } from "./corner-model";
export { resolveCornerHostSpec } from "./corner-policy";
export type { CornerHostInput, CornerHostSpec, YoCornerMode } from "./corner-policy";
