import { MotionSpec, type MotionDurationName } from "../tokens/motion";

/** Presence 配方名（与 motion.css data-recipe 对齐）。 */
export type PresenceRecipe = "dialog" | "toast" | "popover" | "fade" | "rise" | "list";

/** Collapse 配方名（与 motion.css data-recipe 对齐）。 */
export type CollapseRecipe = "collapse" | "panel" | "fill";

/**
 * 出场等待时长：全部指向 MotionSpec，禁止在配方层再写 "local" 字面量。
 * dialog 走 spatialExit；其余淡出/升起/列表高度与 effectsExit / spatialLocal 同 200ms。
 */
export const PRESENCE_EXIT_DURATION: Record<PresenceRecipe, MotionDurationName> = {
  dialog: MotionSpec.spatialExit.duration,
  toast: MotionSpec.effectsExit.duration,
  popover: MotionSpec.effectsExit.duration,
  fade: MotionSpec.effectsExit.duration,
  rise: MotionSpec.effectsExit.duration,
  list: MotionSpec.spatialLocal.duration,
};

/**
 * 出场超时兜底缓冲：在 `PRESENCE_EXIT_DURATION` 之外额外加的余量，
 * 防止 `animationend` 未触发（如 CSS 未加载/项被移出滚动容器）时提前卸载。
 * 该值只是「兜底等待」而非动效时长，因此不放进 `MotionDuration` token（那会被
 * lint 当作动效时长禁写）；与出场时长的关系即「spec 时长 + 本缓冲」。
 */
export const PRESENCE_EXIT_SAFETY_MS = 50;

/** 按钮文案槽：与侧栏/预览栏同一 spatial-panel 宽度过渡。 */
export const SWAP_DURATION: MotionDurationName = MotionSpec.spatialPanel.duration;

/** 选中滑块位移默认档：邻项 150ms 弹簧；短跳/跨栏由 YoIndicator 按行程改写。 */
export const INDICATOR_DURATION: MotionDurationName = MotionSpec.spatialSmall.duration;

/** 传输卡等一次性条目：停留后再播 dismiss-fade；须与 CSS calc(toast − slow) 对齐。 */
export const DISMISS_HOLD_DURATION: MotionDurationName = "toast";
