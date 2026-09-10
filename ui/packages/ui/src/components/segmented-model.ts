/**
 * 分段按钮领域模型（L2，对齐 HarmonyOS SegmentButtonV2）。
 * 类型 × 尺寸是不变式；涂装名给视图当 data-paint。
 * 不碰 DOM、不判定 disabled。
 *
 * 类型：
 * - tab：灰背板 + 白选择块 + 主色字（V2 Tab 默认）
 * - capsule：灰背板 + 强调色选择块 + 反白字（V2 Capsule 默认）
 *
 * 大屏选项建议 ≤7；本层不静默截断，由调用方约束。
 */

export type YoSegmentedType = "tab" | "capsule";
export type YoSegmentedButtonSize = "sm" | "md";
export type YoSegmentedKeyIntent = "next" | "prev" | "start" | "end";
export type SegmentedPaintKind = "tab-surface" | "capsule-accent";
export type SegmentedIconSize = "sm" | "md";

export const SEGMENTED_TYPES = ["tab", "capsule"] as const;
export const SEGMENTED_SIZES = ["sm", "md"] as const;
export const DEFAULT_SEGMENTED_TYPE: YoSegmentedType = "tab";
export const DEFAULT_SEGMENTED_SIZE: YoSegmentedButtonSize = "md";

export interface YoSegmentedItemModel {
  value: string;
  disabled?: boolean;
  label?: string;
  icon?: unknown;
}

/** PC / 大屏建议上限（鸿蒙：手机 ≤5，更大屏幕 ≤7）。 */
export const YO_SEGMENTED_MAX_ITEMS = 7;

export interface SegmentedInput {
  type?: YoSegmentedType;
  size?: YoSegmentedButtonSize;
}

export interface SegmentedSpec {
  type: YoSegmentedType;
  size: YoSegmentedButtonSize;
}

/** 解析缺省。未写 type 即今日 tab 白选择块。 */
export function resolveSegmentedSpec(input: SegmentedInput): SegmentedSpec {
  return {
    type: input.type ?? DEFAULT_SEGMENTED_TYPE,
    size: input.size ?? DEFAULT_SEGMENTED_SIZE,
  };
}

/** CSS 只消费这个名字，不在视图里 if-else 上色。 */
export function segmentedPaintKind(type: YoSegmentedType): SegmentedPaintKind {
  return type === "capsule" ? "capsule-accent" : "tab-surface";
}

/** 图文或 md 走中图标；仅 sm 纯文本/纯图标走小图标。 */
export function segmentedIconSize(spec: SegmentedSpec, hybrid: boolean): SegmentedIconSize {
  return hybrid || spec.size === "md" ? "md" : "sm";
}

/** 图文混合走 V2 doubleline 高度。 */
export function isHybridItems(items: readonly YoSegmentedItemModel[]): boolean {
  return items.some((item) => item.icon != null && Boolean(item.label));
}

export function resolveSelectedIndex(items: readonly YoSegmentedItemModel[], value: string): number {
  const index = items.findIndex((item) => item.value === value);
  return index >= 0 ? index : 0;
}

export function enabledItemIndexes(items: readonly YoSegmentedItemModel[]): number[] {
  return items.flatMap((item, index) => (item.disabled ? [] : [index]));
}

export function stepEnabledIndex(enabled: readonly number[], current: number, delta: number): number | undefined {
  if (enabled.length === 0) return undefined;
  const pos = enabled.indexOf(current);
  const from = pos >= 0 ? pos : 0;
  return enabled[(from + delta + enabled.length) % enabled.length];
}

export function edgeEnabledIndex(enabled: readonly number[], edge: "start" | "end"): number | undefined {
  if (enabled.length === 0) return undefined;
  return edge === "start" ? enabled[0] : enabled[enabled.length - 1];
}

export function segmentKeyIntent(key: string): YoSegmentedKeyIntent | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return "next";
    case "ArrowLeft":
    case "ArrowUp":
      return "prev";
    case "Home":
      return "start";
    case "End":
      return "end";
    default:
      return null;
  }
}

export function resolveKeyIndex(
  items: readonly YoSegmentedItemModel[],
  value: string,
  key: string,
): number | undefined {
  const intent = segmentKeyIntent(key);
  if (!intent) return undefined;
  const enabled = enabledItemIndexes(items);
  if (intent === "start") return edgeEnabledIndex(enabled, "start");
  if (intent === "end") return edgeEnabledIndex(enabled, "end");
  return stepEnabledIndex(enabled, resolveSelectedIndex(items, value), intent === "next" ? 1 : -1);
}
