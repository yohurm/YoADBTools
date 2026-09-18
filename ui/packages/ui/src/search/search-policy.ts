/**
 * 搜索框交互策略（L3）。
 * HarmonyOS Search：searchIcon + CancelButtonStyle + 可折叠为图标。
 * 不写色、不画铬。
 */

export type YoSearchStatus = "none" | "error" | "warning";
export type YoSearchSlot = "entry" | "bar" | "both";
export type YoSearchCancel = "input" | "constant" | "invisible";
export type SearchPaintKind = "neutral" | "error" | "warning";
export type SearchWidthKind = "hug" | "fill";

export function resolveSearchSlot(slot?: string): YoSearchSlot {
  if (slot === "entry" || slot === "bar" || slot === "both") return slot;
  return "bar";
}

export function searchShowsEntry(slot: YoSearchSlot): boolean {
  return slot === "entry" || slot === "both";
}

export function searchShowsBar(slot: YoSearchSlot): boolean {
  return slot === "bar" || slot === "both";
}

/** 非折叠态栏始终开。折叠态只认受控 open。 */
export function resolveSearchOpen(input: { collapsible?: boolean; open?: boolean }): boolean {
  if (!input.collapsible) return true;
  return Boolean(input.open);
}

export function resolveSearchCancel(cancel?: string): YoSearchCancel {
  if (cancel === "constant" || cancel === "invisible") return cancel;
  return "input";
}

export function resolveSearchStatus(status?: string): YoSearchStatus {
  if (status === "error" || status === "warning") return status;
  return "none";
}

export function searchPaintKind(status: YoSearchStatus): SearchPaintKind {
  if (status === "error" || status === "warning") return status;
  return "neutral";
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
  if (input.disabled) return false;
  const cancel = resolveSearchCancel(input.cancel);
  if (cancel === "invisible") return false;
  if (cancel === "constant") return true;
  return (input.value ?? "").length > 0;
}

/** 未写 active 时，有查询即描边。 */
export function resolveSearchActive(input: { active?: boolean; value?: string }): boolean {
  if (input.active !== undefined) return Boolean(input.active);
  return (input.value ?? "").length > 0;
}

/** 栏开着或仍有查询：入口保持按下，避免收起后过滤还在、钮却像闲置。 */
export function searchEntryPressed(input: { open: boolean; value?: string }): boolean {
  return input.open || (input.value ?? "").length > 0;
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
  "data-open": "true" | "false";
  "data-collapsible": true | undefined;
  "data-status": YoSearchStatus;
  "data-paint": SearchPaintKind;
  "data-width": SearchWidthKind;
  "data-clearable": true | undefined;
  "data-disabled": true | undefined;
  "data-active": true | undefined;
  disabled: boolean;
  "aria-invalid": true | undefined;
}

export function searchHostAttrs(input: SearchHostInput): SearchHostAttrs {
  const slot = resolveSearchSlot(input.slot);
  const status = resolveSearchStatus(input.status);
  const open = resolveSearchOpen(input);
  const disabled = Boolean(input.disabled);
  return {
    "data-slot": slot,
    "data-open": open ? "true" : "false",
    "data-collapsible": input.collapsible ? true : undefined,
    "data-status": status,
    "data-paint": searchPaintKind(status),
    "data-width": resolveSearchWidth({ slot, block: input.block }),
    "data-clearable": searchShowClear({ cancel: input.cancel, value: input.value, disabled })
      ? true
      : undefined,
    "data-disabled": disabled ? true : undefined,
    "data-active": resolveSearchActive(input) ? true : undefined,
    disabled,
    "aria-invalid": status === "error" ? true : undefined,
  };
}
