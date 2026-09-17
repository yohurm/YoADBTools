/**
 * 列表项领域模型（L2）。
 * 对照 HarmonyOS ListItem 效率型：左装饰 + 一级/二级/三级文本 + 右槽。
 * size 只定行高轴（nav / device），不写色值。
 * 不碰 DOM。
 */

export type YoListItemRole = "option" | "button";
export type YoListItemSize = "nav" | "device";
export type YoListItemRing = "outset" | "inset";

export const DEFAULT_LIST_ITEM_ROLE: YoListItemRole = "option";
export const DEFAULT_LIST_ITEM_SIZE: YoListItemSize = "nav";
export const DEFAULT_LIST_ITEM_RING: YoListItemRing = "outset";

export interface ListItemInput {
  role?: YoListItemRole;
  size?: YoListItemSize;
  ring?: YoListItemRing;
  selected?: boolean;
  current?: boolean;
}

export interface ListItemSpec {
  role: YoListItemRole;
  size: YoListItemSize;
  ring: YoListItemRing;
  selected: boolean;
  current: boolean;
}

export function resolveListItemSpec(input: ListItemInput): ListItemSpec {
  return {
    role: input.role === "button" ? "button" : DEFAULT_LIST_ITEM_ROLE,
    size: input.size === "device" ? "device" : DEFAULT_LIST_ITEM_SIZE,
    ring: input.ring === "inset" ? "inset" : DEFAULT_LIST_ITEM_RING,
    selected: Boolean(input.selected),
    current: Boolean(input.current),
  };
}
