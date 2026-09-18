/**
 * YoListPresence —— 非虚拟短列表的 insert/remove（动画系统-v6.md 配方 list）。
 * 对照 Vue TransitionGroup：只给新 key 挂 Presence（出生 closed→open）；已在场槽不重挂。
 * 身份槽走 useListPresenceSlots；清屏等一次性整表移除可 `exit={false}` 直切。
 */
import { For, createMemo } from "solid-js";
import type { JSX } from "solid-js";

import type { PresenceRecipe } from "../../spec/recipes";
import { useListPresenceSlots } from "./list-presence-engine";
import { firstPresentSlotKey } from "./list-presence-model";
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

export function YoListPresence<T>(props: YoListPresenceProps<T>): JSX.Element {
  const { slots, dismiss } = useListPresenceSlots<T>({
    items: () => props.each,
    keyOf: (item) => String(props.key(item)),
    allowExit: () => props.exit !== false,
  });

  const firstKey = createMemo(() => firstPresentSlotKey(slots));

  return (
    <For each={slots}>
      {(slot) => (
        <YoPresence
          when={slot.present}
          recipe={props.recipe ?? "list"}
          first={listPresenceHostAttrs(firstKey(), slot.key).first}
          onExitComplete={() => dismiss(slot.key)}
        >
          {props.children(slot.item)}
        </YoPresence>
      )}
    </For>
  );
}
