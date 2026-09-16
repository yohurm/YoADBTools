/**
 * 分段按钮交互策略（L3）。
 * 整组/单项禁用、提交、键盘与 roving 是同一写入口；宿主 data-* 从模型快照组装。
 * 不写色值、不画铬、不测选择块几何。
 */

import {
  isHybridItems,
  itemAccessibleName,
  resolveKeyIndex,
  resolveRovingValue,
  resolveSegmentedGraphic,
  resolveSegmentedJoin,
  resolveSegmentedSpec,
  resolveSelectedValues,
  segmentedFillOwner,
  segmentedIconSize,
  segmentedItemContent,
  segmentedPaintKind,
  toggleSelectedValues,
  type SegmentedFillOwner,
  type SegmentedGraphic,
  type SegmentedIconSize,
  type SegmentedInput,
  type SegmentedJoin,
  type SegmentedPaintKind,
  type YoSegmentedButtonSize,
  type YoSegmentedContent,
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

export interface SegmentedMultiCommit {
  index: number;
  values: string[];
  changed: boolean;
}

export interface SegmentedActionInput {
  items: readonly YoSegmentedItemModel[];
  multiple: boolean;
  value?: string;
  values?: readonly string[];
  disabled?: boolean;
  roving?: string;
}

export type SegmentedAction =
  | {
      kind: "commit-single";
      index: number;
      value: string;
      changed: boolean;
      focus: boolean;
      focusValue: string;
    }
  | {
      kind: "commit-multi";
      index: number;
      values: string[];
      changed: boolean;
      focus: boolean;
      focusValue: string;
    }
  | {
      kind: "roving";
      index: number;
      focusValue: string;
    };

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

/** 胶囊多选：再点已选项取消。空数组合法。 */
export function resolveSegmentedMultiCommit(
  items: readonly YoSegmentedItemModel[],
  values: readonly string[],
  index: number,
  groupDisabled?: boolean,
): SegmentedMultiCommit | undefined {
  if (groupDisabled) return undefined;
  const item = items[index];
  if (!item || item.disabled) return undefined;
  const current = resolveSelectedValues(items, values);
  const next = toggleSelectedValues(items, current, item.value);
  return {
    index,
    values: next,
    changed: next.length !== current.length || next.some((value, i) => value !== current[i]),
  };
}

export function resolveSegmentedSelection(
  items: readonly YoSegmentedItemModel[],
  multiple: boolean,
  value?: string,
  values?: readonly string[],
): string[] {
  return multiple ? resolveSelectedValues(items, values) : value ? [value] : [];
}

export function resolveSegmentedRoving(
  items: readonly YoSegmentedItemModel[],
  selected: readonly string[],
  options: { focus?: string; value?: string; multiple: boolean },
): string | undefined {
  const hint = options.focus ?? (options.multiple ? undefined : options.value);
  return resolveRovingValue(items, selected, hint);
}

/** 指针提交：单选改值，多选切换集合。不移焦。 */
export function resolveSegmentedPointerAction(
  input: SegmentedActionInput,
  index: number,
): SegmentedAction | undefined {
  if (input.multiple) {
    const next = resolveSegmentedMultiCommit(input.items, input.values ?? [], index, input.disabled);
    if (!next) return undefined;
    const value = input.items[next.index]?.value;
    if (!value) return undefined;
    return {
      kind: "commit-multi",
      index: next.index,
      values: next.values,
      changed: next.changed,
      focus: false,
      focusValue: value,
    };
  }
  const next = resolveSegmentedCommit(input.items, input.value ?? "", index, input.disabled);
  if (!next) return undefined;
  return {
    kind: "commit-single",
    index: next.index,
    value: next.value,
    changed: next.changed,
    focus: false,
    focusValue: next.value,
  };
}

/** 键盘：单选提交并移焦；多选只走 roving。 */
export function resolveSegmentedKeyAction(
  input: SegmentedActionInput,
  key: string,
): SegmentedAction | undefined {
  if (input.disabled) return undefined;
  const index = resolveKeyIndex(input.items, input.roving ?? "", key);
  if (index === undefined) return undefined;
  const value = input.items[index]?.value;
  if (!value) return undefined;
  if (input.multiple) {
    return { kind: "roving", index, focusValue: value };
  }
  const next = resolveSegmentedCommit(input.items, input.value ?? "", index, input.disabled);
  if (!next) return undefined;
  return {
    kind: "commit-single",
    index: next.index,
    value: next.value,
    changed: next.changed,
    focus: true,
    focusValue: next.value,
  };
}

export interface SegmentedHostInput extends SegmentedInput, SegmentedInteractiveInput {
  items: readonly YoSegmentedItemModel[];
}

export interface SegmentedHostAttrs {
  "data-type": YoSegmentedType;
  "data-size": YoSegmentedButtonSize;
  "data-paint": SegmentedPaintKind;
  "data-fill-owner": SegmentedFillOwner;
  "data-hybrid": "" | undefined;
  "data-multiple": "" | undefined;
  "data-block": "" | undefined;
  "data-icon-size": SegmentedIconSize;
  "aria-disabled": true | undefined;
  "aria-multiselectable": true | undefined;
}

export function segmentedHostAttrs(input: SegmentedHostInput): SegmentedHostAttrs {
  const spec = resolveSegmentedSpec(input);
  const interactive = resolveSegmentedInteractive(input);
  const hybrid = isHybridItems(input.items);
  const paint = segmentedPaintKind(spec.type, spec.multiple);
  return {
    "data-type": spec.type,
    "data-size": spec.size,
    "data-paint": paint,
    "data-fill-owner": segmentedFillOwner(paint),
    "data-hybrid": hybrid ? "" : undefined,
    "data-multiple": spec.multiple ? "" : undefined,
    "data-block": spec.block ? "" : undefined,
    "data-icon-size": segmentedIconSize(spec, hybrid),
    "aria-disabled": interactive.disabled ? true : undefined,
    "aria-multiselectable": spec.multiple ? true : undefined,
  };
}

export interface SegmentedItemAttrs {
  selected: boolean;
  disabled: boolean;
  tabIndex: 0 | -1;
  content: YoSegmentedContent;
  graphic: SegmentedGraphic | undefined;
  join: SegmentedJoin;
  ink: string | undefined;
  fill: string | undefined;
  name: string | undefined;
  description: string | undefined;
  "aria-checked": boolean | undefined;
  "aria-pressed": boolean | undefined;
}

export function segmentedItemAttrs(
  item: YoSegmentedItemModel,
  selectedValues: readonly string[],
  options?: {
    groupDisabled?: boolean;
    multiple?: boolean;
    roving?: string;
    items?: readonly YoSegmentedItemModel[];
    index?: number;
  },
): SegmentedItemAttrs {
  const selected = selectedValues.includes(item.value);
  const multiple = Boolean(options?.multiple);
  const roving = options?.roving ?? selectedValues[0] ?? item.value;
  const items = options?.items;
  const index = options?.index;
  const join =
    items && index !== undefined
      ? resolveSegmentedJoin(
          items.map((entry) => selectedValues.includes(entry.value)),
          index,
        )
      : selected
        ? "only"
        : "none";
  return {
    selected,
    disabled: Boolean(options?.groupDisabled) || Boolean(item.disabled),
    tabIndex: item.value === roving ? 0 : -1,
    content: segmentedItemContent(item),
    graphic: resolveSegmentedGraphic(item, selected),
    join,
    ink: item.ink,
    fill: item.fill,
    name: itemAccessibleName(item),
    description: item.ariaDescription,
    "aria-checked": multiple ? undefined : selected,
    "aria-pressed": multiple ? selected : undefined,
  };
}
