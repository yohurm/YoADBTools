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

/** 导航按钮行。option 是它的另一面。 */
export function listItemRoleIsButton(role: YoListItemRole | undefined): boolean {
  return role === "button";
}

/** 设备卡行高。缺省是导航行。 */
export function listItemSizeIsDevice(size: YoListItemSize | undefined): boolean {
  return size === "device";
}

/** 导航行高。图标回弹只认这一把。 */
export function listItemSizeIsNav(size: YoListItemSize): boolean {
  return !listItemSizeIsDevice(size);
}

/** 内收焦点环。缺省外放。 */
export function listItemRingIsInset(ring: YoListItemRing | undefined): boolean {
  return ring === "inset";
}

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
    role: listItemRoleIsButton(input.role) ? "button" : DEFAULT_LIST_ITEM_ROLE,
    size: listItemSizeIsDevice(input.size) ? "device" : DEFAULT_LIST_ITEM_SIZE,
    ring: listItemRingIsInset(input.ring) ? "inset" : DEFAULT_LIST_ITEM_RING,
    selected: Boolean(input.selected),
    current: Boolean(input.current),
  };
}
