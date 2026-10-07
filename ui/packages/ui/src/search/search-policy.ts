/**
 * 搜索框交互策略（L3）。
 * HarmonyOS Search：searchIcon + CancelButtonStyle + 可折叠为图标。
 * 不写色、不画铬。
 */

import { presenceAttr, flagAttr, type FlagAttr } from "../dom/flag";
import { controlIsDisabled } from "../basic/control-busy";
import {
  fieldPaintKind,
  fieldStatusInvalid,
  resolveFieldStatus,
  type FieldPaintKind,
  type FieldStatus,
} from "../form/field-status";

export type YoSearchSlot = "entry" | "bar" | "both";
export type YoSearchCancel = "input" | "constant" | "invisible";
export type SearchWidthKind = "hug" | "fill";

const SEARCH_SLOTS: readonly YoSearchSlot[] = ["entry", "bar", "both"];
const SEARCH_CANCELS: readonly YoSearchCancel[] = ["input", "constant", "invisible"];

function searchSlotIsBoth(slot: YoSearchSlot): boolean {
  return slot === "both";
}

function searchSlotIsEntry(slot: YoSearchSlot): boolean {
  return slot === "entry";
}

function searchSlotIsBar(slot: YoSearchSlot): boolean {
  return slot === "bar";
}

function searchCancelIsInvisible(cancel: YoSearchCancel): boolean {
  return cancel === "invisible";
}

function searchCancelIsConstant(cancel: YoSearchCancel): boolean {
  return cancel === "constant";
}

export function resolveSearchSlot(slot?: string): YoSearchSlot {
  for (const known of SEARCH_SLOTS) {
    if (slot === known) return known;
  }
  return "bar";
}

export function searchShowsEntry(slot: YoSearchSlot): boolean {
  return searchSlotIsEntry(slot) || searchSlotIsBoth(slot);
}

export function searchShowsBar(slot: YoSearchSlot): boolean {
  return searchSlotIsBar(slot) || searchSlotIsBoth(slot);
}

/** 非折叠态栏始终开。折叠态只认受控 open。 */
export function resolveSearchOpen(input: { collapsible?: boolean; open?: boolean }): boolean {
  if (!input.collapsible) return true;
  return Boolean(input.open);
}

export function resolveSearchCancel(cancel?: string): YoSearchCancel {
  for (const known of SEARCH_CANCELS) {
    if (cancel === known) return known;
  }
  return "input";
}

/** 查询串有字符。清除、描边、入口按下和 Escape 都认这一把。 */
export function searchHasQuery(value?: string): boolean {
  return (value ?? "").length > 0;
}

/** 栏默认铺宽。入口只 hug。block=false 才 hug。 */
export function resolveSearchWidth(input: { slot: YoSearchSlot; block?: boolean }): SearchWidthKind {
  if (!searchShowsBar(input.slot)) return "hug";
  return input.block === false ? "hug" : "fill";
}

export function searchShowClear(input: {
  cancel?: string;
  value?: string;
  disabled?: boolean;
}): boolean {
  if (controlIsDisabled(input.disabled)) return false;
  const cancel = resolveSearchCancel(input.cancel);
  if (searchCancelIsInvisible(cancel)) return false;
  if (searchCancelIsConstant(cancel)) return true;
  return searchHasQuery(input.value);
}

/** 未写 active 时，有查询即描边。 */
export function resolveSearchActive(input: { active?: boolean; value?: string }): boolean {
  if (input.active !== undefined) return Boolean(input.active);
  return searchHasQuery(input.value);
}

/** 栏开着或仍有查询：入口保持按下，避免收起后过滤还在、钮却像闲置。 */
export function searchEntryPressed(input: { open: boolean; value?: string }): boolean {
  return input.open || searchHasQuery(input.value);
}

export interface SearchHostInput {
  slot?: string;
  collapsible?: boolean;
  open?: boolean;
  value?: string;
  status?: string;
  cancel?: string;
  disabled?: boolean;
  block?: boolean;
  active?: boolean;
}

export interface SearchHostAttrs {
  "data-slot": YoSearchSlot;
  "data-open": FlagAttr;
  "data-collapsible": "" | undefined;
  "data-status": FieldStatus;
  "data-paint": FieldPaintKind;
  "data-width": SearchWidthKind;
  "data-clearable": "" | undefined;
  "data-disabled": "" | undefined;
  "data-active": "" | undefined;
  disabled: boolean;
  "aria-invalid": true | undefined;
}

export function searchHostAttrs(input: SearchHostInput): SearchHostAttrs {
  const slot = resolveSearchSlot(input.slot);
  const status = resolveFieldStatus(input.status);
  const open = resolveSearchOpen(input);
  const disabled = controlIsDisabled(input.disabled);
  return {
    "data-slot": slot,
    "data-open": flagAttr(open),
    "data-collapsible": presenceAttr(Boolean(input.collapsible)),
    "data-status": status,
    "data-paint": fieldPaintKind(status),
    "data-width": resolveSearchWidth({ slot, block: input.block }),
    "data-clearable": presenceAttr(
      searchShowClear({ cancel: input.cancel, value: input.value, disabled }),
    ),
    "data-disabled": presenceAttr(disabled),
    "data-active": presenceAttr(resolveSearchActive(input)),
    disabled,
    "aria-invalid": fieldStatusInvalid(status),
  };
}
