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
  const prevByKey = new Map(input.prev.map((slot) => [slot.key, slot]));
  const incoming = new Set(keys);
  const next: ListPresenceSlot<T>[] = [];

  keys.forEach((key, index) => {
    const existing = prevByKey.get(key);
    if (existing) {
      existing.item = items[index]!;
      existing.present = true;
      next.push(existing);
      return;
    }
    next.push({ key, item: items[index]!, present: true });
  });

  if (!allowExit) return next;

  for (const slot of input.prev) {
    if (incoming.has(slot.key)) continue;
    slot.present = false;
    const oldIndex = input.prev.indexOf(slot);
    let insertAt = next.length;
    if (oldIndex === 0) {
      insertAt = 0;
    } else {
      for (let look = oldIndex - 1; look >= 0; look -= 1) {
        const neighbor = input.prev[look]!.key;
        const neighborIndex = next.findIndex((entry) => entry.key === neighbor);
        if (neighborIndex >= 0) {
          insertAt = neighborIndex + 1;
          break;
        }
      }
    }
    next.splice(insertAt, 0, slot);
  }

  return next;
}
