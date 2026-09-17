/**
 * YoListPresence —— 非虚拟短列表的 insert/remove（动画系统-v6.md 配方 list）。
 * 对照 Vue TransitionGroup：只给新 key 挂 Presence（出生 closed→open）；已在场槽不重挂。
 * 保留正在出场的项直到 YoPresence 卸完；清屏等一次性整表移除可 `exit={false}` 直切。
 */
import { For, createEffect, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { createStore, produce } from "solid-js/store";

import type { PresenceRecipe } from "../../spec/recipes";
import { firstPresentSlotKey, reconcileListPresenceSlots, type ListPresenceSlot } from "./list-presence-model";
import { listPresenceHostAttrs } from "./list-presence-policy";
import { YoPresence } from "./presence";

export interface YoListPresenceProps<T> {
  each: readonly T[];
  key: (item: T) => string | number;
  /** 移除时播出场。false = 直切卸载。默认 true。 */
  exit?: boolean;
  /** 默认 list（纵向高度）。写入盒 Token 用 chip（横向宽度，不撑铬高）。 */
  recipe?: Extract<PresenceRecipe, "list" | "chip">;
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

  const firstKey = createMemo(() => firstPresentSlotKey(slots));

  return (
    <For each={slots}>
      {(slot) => (
        <YoPresence
          when={slot.present}
          recipe={props.recipe ?? "list"}
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
