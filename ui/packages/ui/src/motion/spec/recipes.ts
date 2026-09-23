import { MotionSpec, type MotionDurationName } from "../../tokens/motion";

/** Presence 配方名（与 motion.css data-recipe 对齐）。 */
export type PresenceRecipe = "dialog" | "toast" | "popover" | "fade" | "rise" | "list" | "chip";

/** 用 clip 层裁切进场的配方。list / toast 裁高度，chip 裁宽度。 */
export const PRESENCE_CLIP_RECIPES: readonly PresenceRecipe[] = ["list", "chip", "toast"];

/** transition 可打断：出生 closed，双 rAF 后 open。clip 配方。keyframes 配方不在此列。 */
export const PRESENCE_TRANSITION_RECIPES: readonly PresenceRecipe[] = ["list", "chip", "toast"];

export function presenceUsesClip(recipe: PresenceRecipe): boolean {
  return recipe === "list" || recipe === "chip" || recipe === "toast";
}

export function presenceUsesTransition(recipe: PresenceRecipe): boolean {
  return recipe === "list" || recipe === "chip" || recipe === "toast";
}

export function presenceClipProperty(
  recipe: PresenceRecipe,
): "grid-template-rows" | "grid-template-columns" | null {
  if (recipe === "list" || recipe === "toast") return "grid-template-rows";
  if (recipe === "chip") return "grid-template-columns";
  return null;
}

/** 出场 transitionend 要等的属性。keyframes 配方返回 null，改等 animationend。 */
export function presenceExitWatchProperty(recipe: PresenceRecipe): string | null {
  return presenceClipProperty(recipe);
}

/** Collapse 配方名（与 motion.css data-recipe 对齐）。对话框名单走 YoReveal，不在此列。 */
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
  chip: MotionSpec.spatialLocal.duration,
};

/**
 * 出场超时兜底缓冲：在 `PRESENCE_EXIT_DURATION` 之外额外加的余量，
 * 防止 `animationend` 未触发（如 CSS 未加载/项被移出滚动容器）时提前卸载。
 * 该值只是「兜底等待」而非动效时长，因此不放进 `MotionDuration` token（那会被
 * lint 当作动效时长禁写）；与出场时长的关系即「spec 时长 + 本缓冲」。
 */
export const PRESENCE_EXIT_SAFETY_MS = 50;

/** 按钮文案槽：与预览栏同一 spatial-panel 宽度过渡。 */
export const SWAP_DURATION: MotionDurationName = MotionSpec.spatialPanel.duration;

/** 尺寸行程：与 swap / preview 同一 spatial-panel。 */
export const TRAVEL_SPEC = "spatialPanel" as const;

/** 内容用后高：微过冲弹簧。折叠 0fr/1fr 仍走 spatialLocal。 */
export const GROW_SPEC = "spatialGrow" as const;

/** 轨上持续铬（Tabs 下划线 / 分段 thumb）位移默认档；短跳/跨栏由 YoIndicator 按行程改写。 */
export const INDICATOR_DURATION: MotionDurationName = MotionSpec.spatialSmall.duration;

/** 传输卡等一次性条目：停留后再播 dismiss-fade；须与 CSS calc(toast − slow) 对齐。 */
export const DISMISS_HOLD_DURATION: MotionDurationName = "toast";
