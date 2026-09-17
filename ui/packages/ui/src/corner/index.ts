/**
 * 圆角绘制模块。L5 只转发 YoCorner / CornerPillRadius，不转发路径函数。
 */
export { YoCorner } from "./Corner";
export type {
  YoCornerProps,
  YoCornerAlign,
  YoCornerDirection,
  YoCornerFlex,
  YoCornerGap,
  YoCornerJustify,
  YoCornerOverflow,
  YoCornerPad,
} from "./Corner";
export {
  CORNER_PAINT_VIEWBOX,
  CornerPillRadius,
  clampCornerRadii,
  cornerEdgeHaloPath,
  cornerHaloOutset,
  cornerRadiiToUnit,
  cornerRadiusForRole,
  cornerStrokeRingPath,
  cssCornerClip,
  cssCornerPath,
  formatCornerCoord,
  insetCornerRadii,
  mergeCornerRadii,
  outsetCornerRadii,
  pointInRoundedRect,
  resolveCornerPaint,
  roundedRectPath,
  roundedRectPathCcw,
  roundedRectPathXY,
  uniformCornerRadii,
} from "./corner-model";
export type { CornerPaint, CornerPaintInput, CornerRadii, CornerRadiiXY, CornerRole } from "./corner-model";
export { resolveCornerContentSpec, resolveCornerHostSpec } from "./corner-policy";
export type {
  CornerContentInput,
  CornerContentSpec,
  CornerHostInput,
  CornerHostSpec,
  YoCornerMode,
} from "./corner-policy";
