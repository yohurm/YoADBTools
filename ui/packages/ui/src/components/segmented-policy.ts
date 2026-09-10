/**
 * 分段按钮交互策略（L3）。
 * 整组/单项禁用与提交是同一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬、不测选择块几何。
 */

import {
  isHybridItems,
  resolveSegmentedSpec,
  segmentedIconSize,
  segmentedPaintKind,
  type SegmentedIconSize,
  type SegmentedInput,
  type SegmentedPaintKind,
  type YoSegmentedButtonSize,
  type YoSegmentedItemModel,
  type YoSegmentedType,
} from "./segmented-model";

export interface SegmentedInteractiveInput {
  disabled?: boolean;
}

export interface SegmentedInteractive {
  disabled: boolean;
}

export function resolveSegmentedInteractive(input: SegmentedInteractiveInput): SegmentedInteractive {
  return { disabled: Boolean(input.disabled) };
}

export interface SegmentedCommit {
  index: number;
  value: string;
  changed: boolean;
}

/** 整组或单项禁用则拒绝提交；再点当前项 changed=false。 */
export function resolveSegmentedCommit(
  items: readonly YoSegmentedItemModel[],
  value: string,
  index: number,
  groupDisabled?: boolean,
): SegmentedCommit | undefined {
  if (groupDisabled) return undefined;
  const item = items[index];
  if (!item || item.disabled) return undefined;
  return {
    index,
    value: item.value,
    changed: item.value !== value,
  };
}

export interface SegmentedHostInput extends SegmentedInput, SegmentedInteractiveInput {
  items: readonly YoSegmentedItemModel[];
}

export interface SegmentedHostAttrs {
  "data-type": YoSegmentedType;
  "data-size": YoSegmentedButtonSize;
  "data-paint": SegmentedPaintKind;
  "data-hybrid": "" | undefined;
  "data-icon-size": SegmentedIconSize;
  "aria-disabled": true | undefined;
}

export function segmentedHostAttrs(input: SegmentedHostInput): SegmentedHostAttrs {
  const spec = resolveSegmentedSpec(input);
  const interactive = resolveSegmentedInteractive(input);
  const hybrid = isHybridItems(input.items);
  return {
    "data-type": spec.type,
    "data-size": spec.size,
    "data-paint": segmentedPaintKind(spec.type),
    "data-hybrid": hybrid ? "" : undefined,
    "data-icon-size": segmentedIconSize(spec, hybrid),
    "aria-disabled": interactive.disabled ? true : undefined,
  };
}

export interface SegmentedItemAttrs {
  selected: boolean;
  disabled: boolean;
  tabIndex: 0 | -1;
  "aria-checked": boolean;
}

export function segmentedItemAttrs(
  item: YoSegmentedItemModel,
  value: string,
  groupDisabled?: boolean,
): SegmentedItemAttrs {
  const selected = item.value === value;
  return {
    selected,
    disabled: Boolean(groupDisabled) || Boolean(item.disabled),
    tabIndex: selected ? 0 : -1,
    "aria-checked": selected,
  };
}
