/**
 * 分段按钮领域模型（L2，对齐 HarmonyOS SegmentButton / SegmentButtonV2）。
 * 设计指南三种：页签单选、胶囊单选、胶囊多选。内容：纯文本 / 纯图标 / 图文。
 * 不碰 DOM、不判定 disabled。
 *
 * 类型：
 * - tab：灰背板 + 白选择块 + 主色字（页签切换）
 * - capsule：灰背板 + 强调色选择块 + 反白字（表单单选）
 * - capsule + multiple：与单选共轨，选中项强调色块，相邻连成一块（多选筛选）
 *
 * 页签 multiply 强制 false。大屏建议 ≤7；本层不静默截断。
 *
 * 涂装 × 选中 × 交互态的填归属见 segmentedFillCell。
 * tab-surface / capsule-accent：选中填在滑块；capsule-multi：选中填在项。
 * 未选 hover/pressed 填在项。选中 hover/pressed 叠 --yohu-state-*，不换 accent-hover 实底。
 * 未选字色走可选 ink。项 fill 覆盖选中填（鸿蒙 selectedBackgroundColor）；缺省强调色。
 */

import {
  enabledIndexes,
  horizontalListDelta,
  itemIsEnabled,
  listEdgeIndex,
  listEdgeKey,
  stepWrappedIndex,
  verticalListDelta,
  type ListEdge,
} from "../keymap/list-index";
import { controlIsBlock } from "./control-busy";
import type { ControlIconSize } from "./control-icon";

export type YoSegmentedType = "tab" | "capsule";
export type YoSegmentedButtonSize = "sm" | "md";
export type YoSegmentedKeyIntent = "next" | "prev" | "start" | "end";
export type YoSegmentedContent = "text" | "icon" | "image" | "hybrid";
export type SegmentedGraphic =
  | { kind: "icon"; name: unknown }
  | { kind: "image"; src: string };

/** 图标槽。内容种类 text/icon/image/hybrid 是另一份事实。 */
export function segmentedGraphicIsIcon(
  graphic: SegmentedGraphic,
): graphic is Extract<SegmentedGraphic, { kind: "icon" }> {
  return graphic.kind === "icon";
}

/** 图片槽。 */
export function segmentedGraphicIsImage(
  graphic: SegmentedGraphic,
): graphic is Extract<SegmentedGraphic, { kind: "image" }> {
  return graphic.kind === "image";
}
export type SegmentedPaintKind = "tab-surface" | "capsule-accent" | "capsule-multi";
/** 多选相邻选中如何并角。none = 未选；only = 孤立选中。 */
export type SegmentedJoin = "none" | "only" | "start" | "mid" | "end";
/** 这一格的实底画在滑块还是项上。 */
export type SegmentedFillOwner = "thumb" | "item";
export type SegmentedInteract = "default" | "hover" | "pressed" | "disabled";
/** 叠在实底上的交互层。未选时也可当作格子的 fill。 */
export type SegmentedOverlay = "--yohu-state-hover" | "--yohu-state-pressed" | "none";
export type SegmentedFillToken =
  | "--yohu-surface"
  | "--yohu-accent"
  | "--yohu-state-hover"
  | "--yohu-state-pressed";
export type SegmentedColorToken = "--yohu-fg" | "--yohu-fg-on" | "--yohu-disabled" | "ink";

export const SEGMENTED_TYPES = ["tab", "capsule"] as const;
export const SEGMENTED_SIZES = ["sm", "md"] as const;
export const SEGMENTED_INTERACTS = ["default", "hover", "pressed", "disabled"] as const;
export const DEFAULT_SEGMENTED_TYPE: YoSegmentedType = "tab";

/** 胶囊。多选只在胶囊上成立；页签是它的另一面。 */
export function segmentedTypeIsCapsule(type: YoSegmentedType): boolean {
  return type === "capsule";
}

export const DEFAULT_SEGMENTED_SIZE: YoSegmentedButtonSize = "md";

export interface YoSegmentedItemModel {
  value: string;
  disabled?: boolean;
  label?: string;
  icon?: unknown;
  /** 选中图标；与 icon 成对才切换（鸿蒙 selectedIcon）。 */
  selectedIcon?: unknown;
  /** 图片资源（鸿蒙 Image / 「图片 + 文字」）。 */
  image?: string;
  /** 选中图片；与 image 成对才切换。 */
  selectedImage?: string;
  ariaLabel?: string;
  /** 无障碍说明（鸿蒙 accessibilityDescription）。 */
  ariaDescription?: string;
  /** 未选字色。缺省消费轨上的默认 ink。 */
  ink?: string;
  /** 选中填。缺省消费轨上的强调色（鸿蒙 selectedBackgroundColor）。 */
  fill?: string;
}

/** PC / 大屏建议上限（鸿蒙：手机 ≤5，更大屏幕 ≤7）。 */
export const YO_SEGMENTED_MAX_ITEMS = 7;

export interface SegmentedInput {
  type?: YoSegmentedType;
  size?: YoSegmentedButtonSize;
  /** 仅 capsule 生效；tab 强制单选（鸿蒙 multiply）。 */
  multiple?: boolean;
  /** 铺满父级交叉轴。默认 hug（max-content）。 */
  block?: boolean;
}

export interface SegmentedSpec {
  type: YoSegmentedType;
  size: YoSegmentedButtonSize;
  multiple: boolean;
  block: boolean;
}

export interface SegmentedFillCell {
  owner: SegmentedFillOwner;
  fill: SegmentedFillToken | "none";
  /** 叠在 fill 上的交互层；选中 hover/pressed。 */
  overlay: SegmentedOverlay;
  color: SegmentedColorToken;
}

/** 解析缺省。tab 忽略 multiple。 */
export function resolveSegmentedSpec(input: SegmentedInput): SegmentedSpec {
  const type = input.type ?? DEFAULT_SEGMENTED_TYPE;
  return {
    type,
    size: input.size ?? DEFAULT_SEGMENTED_SIZE,
    multiple: segmentedTypeIsCapsule(type) && Boolean(input.multiple),
    block: controlIsBlock(input.block),
  };
}

/** 多选相邻选中并成一块；单选恒 only/none。 */
export function resolveSegmentedJoin(selected: readonly boolean[], index: number): SegmentedJoin {
  if (!selected[index]) return "none";
  const prev = index > 0 && Boolean(selected[index - 1]);
  const next = index < selected.length - 1 && Boolean(selected[index + 1]);
  if (prev && next) return "mid";
  if (prev) return "end";
  if (next) return "start";
  return "only";
}

/** CSS 只消费这个名字，不在视图里 if-else 上色。 */
export function segmentedPaintKind(type: YoSegmentedType, multiple = false): SegmentedPaintKind {
  if (segmentedTypeIsCapsule(type) && multiple) return "capsule-multi";
  return segmentedTypeIsCapsule(type) ? "capsule-accent" : "tab-surface";
}

/** 选中实底：多选在项上，单选在滑块上。 */
export function segmentedFillOwner(paint: SegmentedPaintKind): SegmentedFillOwner {
  return paint === "capsule-multi" ? "item" : "thumb";
}

/** 页签实底。选中字色和填充都认这一把。 */
function segmentedPaintIsTab(paint: SegmentedPaintKind): boolean {
  return paint === "tab-surface";
}

function segmentedSelectedColor(paint: SegmentedPaintKind): SegmentedColorToken {
  return segmentedPaintIsTab(paint) ? "--yohu-fg" : "--yohu-fg-on";
}

function segmentedSelectedFill(paint: SegmentedPaintKind): SegmentedFillToken {
  return segmentedPaintIsTab(paint) ? "--yohu-surface" : "--yohu-accent";
}

/** 悬停与按下的状态层。未选填在项上，选中叠在实底上，都认这一把。 */
function segmentedInteractLayer(interact: SegmentedInteract): SegmentedOverlay {
  if (interact === "hover") return "--yohu-state-hover";
  if (interact === "pressed") return "--yohu-state-pressed";
  return "none";
}

/**
 * paint × selected × (default|hover|pressed|disabled) 的填归属与色名。
 * L4 只消费本表；禁止按类型把已选 hover 写成 transparent。
 */
export function segmentedFillCell(
  paint: SegmentedPaintKind,
  selected: boolean,
  interact: SegmentedInteract,
): SegmentedFillCell {
  const color: SegmentedColorToken =
    interact === "disabled" ? "--yohu-disabled" : selected ? segmentedSelectedColor(paint) : "ink";

  if (!selected) {
    return { owner: "item", fill: segmentedInteractLayer(interact), overlay: "none", color };
  }

  return {
    owner: segmentedFillOwner(paint),
    fill: segmentedSelectedFill(paint),
    overlay: segmentedInteractLayer(interact),
    color,
  };
}

/** 图文或 md 走中图标；仅 sm 纯文本/纯图标走小图标。 */
export function segmentedIconSize(spec: SegmentedSpec, hybrid: boolean): ControlIconSize {
  return hybrid || spec.size === "md" ? "md" : "sm";
}

export function hasSegmentedGraphic(item: YoSegmentedItemModel): boolean {
  return item.icon != null || Boolean(item.image);
}

export function segmentedItemContent(item: YoSegmentedItemModel): YoSegmentedContent {
  const text = Boolean(item.label);
  const graphic = hasSegmentedGraphic(item);
  if (text && graphic) return "hybrid";
  if (item.image) return "image";
  if (item.icon != null) return "icon";
  return "text";
}

/**
 * 可见图形。icon/selectedIcon、image/selectedImage 成对才切换；
 * 只给一边时按 V2 单资源显示（不静默丢掉已给的 icon/image）。
 */
export function resolveSegmentedGraphic(
  item: YoSegmentedItemModel,
  selected: boolean,
): SegmentedGraphic | undefined {
  if (item.icon != null) {
    const name = selected && item.selectedIcon != null ? item.selectedIcon : item.icon;
    return { kind: "icon", name };
  }
  if (item.image) {
    const src = selected && item.selectedImage ? item.selectedImage : item.image;
    return { kind: "image", src };
  }
  return undefined;
}

/** 图文混合走 V2 doubleline 高度（图标在上、文字在下）。 */
export function isHybridItems(items: readonly YoSegmentedItemModel[]): boolean {
  return items.some((item) => segmentedItemContent(item) === "hybrid");
}

export function itemAccessibleName(item: YoSegmentedItemModel): string | undefined {
  return item.ariaLabel ?? item.label;
}

export function resolveSelectedIndex(items: readonly YoSegmentedItemModel[], value: string): number {
  const index = items.findIndex((item) => item.value === value);
  return index >= 0 ? index : 0;
}

function valuesInItemOrder(items: readonly YoSegmentedItemModel[], set: Set<string>): string[] {
  return items.filter((item) => set.has(item.value)).map((item) => item.value);
}

/** 多选：只保留仍在 items 里的值，顺序跟选项表。 */
export function resolveSelectedValues(
  items: readonly YoSegmentedItemModel[],
  values: readonly string[] | undefined,
): string[] {
  if (!values || values.length === 0) return [];
  const set = new Set(values);
  return valuesInItemOrder(items, set);
}

export function toggleSelectedValues(
  items: readonly YoSegmentedItemModel[],
  values: readonly string[],
  value: string,
): string[] {
  const set = new Set(resolveSelectedValues(items, values));
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return valuesInItemOrder(items, set);
}

export function stepEnabledIndex(enabled: readonly number[], current: number, delta: number): number | undefined {
  if (enabled.length === 0) return undefined;
  const pos = enabled.indexOf(current);
  const from = pos >= 0 ? pos : 0;
  const index = stepWrappedIndex(enabled.length, from, delta);
  return enabled[index];
}

export function edgeEnabledIndex(enabled: readonly number[], edge: ListEdge): number | undefined {
  const index = listEdgeIndex(enabled.length, edge);
  if (index < 0) return undefined;
  return enabled[index];
}

export function segmentKeyIntent(key: string): YoSegmentedKeyIntent | null {
  const delta = verticalListDelta(key) ?? horizontalListDelta(key);
  if (delta === 1) return "next";
  if (delta === -1) return "prev";
  return listEdgeKey(key);
}

export function resolveKeyIndex(
  items: readonly YoSegmentedItemModel[],
  value: string,
  key: string,
): number | undefined {
  const intent = segmentKeyIntent(key);
  if (!intent) return undefined;
  const enabled = enabledIndexes(items);
  if (intent === "start") return edgeEnabledIndex(enabled, "start");
  if (intent === "end") return edgeEnabledIndex(enabled, "end");
  return stepEnabledIndex(enabled, resolveSelectedIndex(items, value), intent === "next" ? 1 : -1);
}

export function resolveRovingValue(
  items: readonly YoSegmentedItemModel[],
  selected: readonly string[],
  focus?: string,
): string | undefined {
  if (focus && items.some((item) => item.value === focus && itemIsEnabled(item))) return focus;
  const firstSelected = selected.find((value) => items.some((item) => item.value === value && itemIsEnabled(item)));
  if (firstSelected) return firstSelected;
  return items.find((item) => itemIsEnabled(item))?.value;
}
