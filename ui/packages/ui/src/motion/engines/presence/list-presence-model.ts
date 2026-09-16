/**
 * 短列表 Presence 槽位（L2）。
 * 树上的槽含出场中（present=false 仍占位直到卸节点）；不碰 DOM。
 */

export interface ListPresenceSlot<T> {
  key: string;
  item: T;
  present: boolean;
}

/** 当前可见列表第一项的 key。空表无首项；出场中的项仍算在树上。 */
export function firstPresentSlotKey<T>(slots: readonly Pick<ListPresenceSlot<T>, "key">[]): string | undefined {
  return slots[0]?.key;
}
