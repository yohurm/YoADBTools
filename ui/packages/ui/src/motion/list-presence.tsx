/**
 * YoListPresence —— 非虚拟短列表的 insert/remove（动画系统-v6.md 配方 list）。
 * 保留正在出场的项直到 YoPresence 卸完；清屏等一次性整表移除可 `exit={false}` 直切。
 */
import { For, createEffect, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { createStore, produce } from "solid-js/store";

import { firstPresentSlotKey, type ListPresenceSlot } from "./list-presence-model";
import { listPresenceHostAttrs } from "./list-presence-policy";
import { YoPresence } from "./presence";

export interface YoListPresenceProps<T> {
  each: readonly T[];
  key: (item: T) => string | number;
  /** 移除时播出场。false = 直切卸载。默认 true。 */
  exit?: boolean;
  children: (item: T) => JSX.Element;
}

type Slot<T> = ListPresenceSlot<T>;

export function YoListPresence<T>(props: YoListPresenceProps<T>): JSX.Element {
  const [slots, setSlots] = createStore<Slot<T>[]>([]);

  createEffect(() => {
    const items = props.each.map((item) => item);
    const keys = items.map((item) => String(props.key(item)));
    const allowExit = props.exit !== false;

    setSlots(
      produce((list) => {
        const prevKeys = new Set(list.map((slot) => slot.key));

        for (let i = list.length - 1; i >= 0; i--) {
          const slot = list[i]!;
          const nextIndex = keys.indexOf(slot.key);
          if (nextIndex >= 0) {
            slot.item = items[nextIndex]!;
            slot.present = true;
          } else if (allowExit) {
            slot.present = false;
          } else {
            list.splice(i, 1);
          }
        }

        keys.forEach((key, index) => {
          if (prevKeys.has(key) || list.some((slot) => slot.key === key)) {
            return;
          }
          const slot: Slot<T> = { key, item: items[index]!, present: true };
          let insertAt = list.length;
          for (let look = index - 1; look >= 0; look--) {
            const neighbor = keys[look]!;
            const neighborIndex = list.findIndex((entry) => entry.key === neighbor);
            if (neighborIndex >= 0) {
              insertAt = neighborIndex + 1;
              break;
            }
          }
          list.splice(insertAt, 0, slot);
        });
      }),
    );
  });

  const firstKey = createMemo(() => firstPresentSlotKey(slots));

  return (
    <For each={slots}>
      {(slot) => (
        <YoPresence
          when={slot.present}
          recipe="list"
          first={listPresenceHostAttrs(firstKey(), slot.key).first}
          onExitComplete={() => {
            setSlots(
              produce((list) => {
                const index = list.findIndex((entry) => entry.key === slot.key);
                if (index >= 0) {
                  list.splice(index, 1);
                }
              }),
            );
          }}
        >
          {props.children(slot.item)}
        </YoPresence>
      )}
    </For>
  );
}
