import { describe, expect, it } from "vitest";

import { firstPresentSlotKey, reconcileListPresenceSlots, type ListPresenceSlot } from "./list-presence-model";

function slot(key: string, item: number, present = true): ListPresenceSlot<number> {
  return { key, item, present };
}

describe("reconcileListPresenceSlots", () => {
  it("新 key 另开一槽，已在场槽保持同一对象", () => {
    const first = slot("0", 0);
    const next = reconcileListPresenceSlots({
      prev: [first],
      items: [0, 1],
      keys: ["0", "1"],
      allowExit: true,
    });
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(first);
    expect(next[0]?.present).toBe(true);
    expect(next[1]?.key).toBe("1");
    expect(next[1]?.present).toBe(true);
    expect(next[1]).not.toBe(first);
  });

  it("去掉的 key 标出场，不丢槽", () => {
    const keep = slot("0", 0);
    const drop = slot("1", 1);
    const next = reconcileListPresenceSlots({
      prev: [keep, drop],
      items: [0],
      keys: ["0"],
      allowExit: true,
    });
    expect(next).toEqual([keep, drop]);
    expect(drop.present).toBe(false);
    expect(keep.present).toBe(true);
  });

  it("exit=false 直切删槽", () => {
    const next = reconcileListPresenceSlots({
      prev: [slot("0", 0), slot("1", 1)],
      items: [0],
      keys: ["0"],
      allowExit: false,
    });
    expect(next.map((entry) => entry.key)).toEqual(["0"]);
  });
});

describe("firstPresentSlotKey", () => {
  it("出场中的首槽仍算树上第一项", () => {
    expect(firstPresentSlotKey([slot("a", 1, false), slot("b", 2)])).toBe("a");
    expect(firstPresentSlotKey([])).toBeUndefined();
  });
});
