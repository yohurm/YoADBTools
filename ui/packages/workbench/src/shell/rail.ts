/**
 * 壳侧栏：常驻双态轨，不是抽屉。
 * 时序与公开 API 在 `@yohu/ui` YoRail（鸿蒙共享容器 + 四类元素）。
 */
export type {
  RailIntent,
  RailPhase,
} from "@yohu/ui";
export {
  railPhaseAfterWidthSettle,
  railPhaseOnIntentChange,
  railSlotOpen,
  railStreamOpen,
  railTooltipEnabled,
  railWidthIntent,
  railWidthMatchesIntent,
} from "@yohu/ui";
