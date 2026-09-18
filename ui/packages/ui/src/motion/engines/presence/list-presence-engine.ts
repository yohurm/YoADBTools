/**
 * 短列表身份槽（L3）。YoListPresence 与 YoReorderList 共用这一份 reconcile。
 * 禁止两处各自 createStore + splice。
 */
import { createEffect } from "solid-js";
import { createStore, produce } from "solid-js/store";

import { reconcileListPresenceSlots, type ListPresenceSlot } from "./list-presence-model";

export function useListPresenceSlots<T>(input: {
  items: () => readonly T[];
  keyOf: (item: T, index: number) => string;
  allowExit?: () => boolean;
}): {
  slots: ListPresenceSlot<T>[];
  dismiss: (key: string) => void;
} {
  const [slots, setSlots] = createStore<ListPresenceSlot<T>[]>([]);

  createEffect(() => {
    const items = input.items().map((item) => item);
    const keys = items.map((item, index) => input.keyOf(item, index));
    const allowExit = input.allowExit ? input.allowExit() : true;
    setSlots(
      produce((list) => {
        const next = reconcileListPresenceSlots({
          prev: list,
          items,
          keys,
          allowExit,
        });
        list.splice(0, list.length, ...next);
      }),
    );
  });

  const dismiss = (key: string): void => {
    setSlots(
      produce((list) => {
        const index = list.findIndex((entry) => entry.key === key);
        if (index >= 0) list.splice(index, 1);
      }),
    );
  };

  return { slots, dismiss };
}
