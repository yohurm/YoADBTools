/**
 * 短列表 Presence 槽位（L2）。
 * 对照 Vue TransitionGroup：enter/leave 只属于插入/删除的 key；已在场的 key 保持同一槽对象。
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

export function reconcileListPresenceSlots<T>(input: {
  prev: readonly ListPresenceSlot<T>[];
  items: readonly T[];
  keys: readonly string[];
  allowExit: boolean;
}): ListPresenceSlot<T>[] {
  const { items, keys, allowExit } = input;
  const next: ListPresenceSlot<T>[] = [];
  const kept = new Set<string>();

  for (const slot of input.prev) {
    const nextIndex = keys.indexOf(slot.key);
    if (nextIndex >= 0) {
      slot.item = items[nextIndex]!;
      slot.present = true;
      next.push(slot);
      kept.add(slot.key);
    } else if (allowExit) {
      slot.present = false;
      next.push(slot);
    }
  }

  keys.forEach((key, index) => {
    if (kept.has(key) || next.some((slot) => slot.key === key)) {
      return;
    }
    const slot: ListPresenceSlot<T> = { key, item: items[index]!, present: true };
    let insertAt = next.length;
    for (let look = index - 1; look >= 0; look--) {
      const neighbor = keys[look]!;
      const neighborIndex = next.findIndex((entry) => entry.key === neighbor);
      if (neighborIndex >= 0) {
        insertAt = neighborIndex + 1;
        break;
      }
    }
    next.splice(insertAt, 0, slot);
  });

  return next;
}
