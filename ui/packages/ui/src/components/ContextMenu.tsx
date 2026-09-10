/**
 * YoContextMenu —— 右键菜单 List 呈现（L4）。
 * HarmonyOS 对照：Menu；电脑默认最小宽 224vp。
 * Host 管开合与落点；本组件管槽位与键盘。页面不要直接挂：走 defineContextMenu + openContextMenu。
 */
import { For, createEffect, createSignal, onCleanup, untrack } from "solid-js";
import type { JSX } from "solid-js";
import type { YoMenuItem } from "../context-menu/types";
import { typeaheadMatchIndex } from "../context-menu/menu-list-model";
import {
  MENU_TYPEAHEAD_WINDOW_MS,
  firstEnabledIndex,
  menuItemHostAttrs,
  menuKeyIntent,
  nextTypeaheadQuery,
} from "../context-menu/menu-key-policy";
import { YoPresence } from "../motion/presence";
import "./ContextMenu.css";

export type { YoMenuItem };

export interface YoContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: YoMenuItem[];
  onClose: () => void;
  onSelect: (id: string) => void;
  /** 测量回调：菜单挂载/布局就绪后上报实测宽高，供外层按真实尺寸二次夹紧。 */
  onPlace?: (size: { width: number; height: number }) => void;
}

export function YoContextMenu(props: YoContextMenuProps): JSX.Element {
  let root: HTMLDivElement | undefined;
  const [focusIndex, setFocusIndex] = createSignal(0);
  let typeaheadQuery = "";
  let typeaheadAt = 0;
  let typeaheadTimer: number | undefined;

  const clearTypeahead = (): void => {
    typeaheadQuery = "";
    if (typeaheadTimer !== undefined) {
      window.clearTimeout(typeaheadTimer);
      typeaheadTimer = undefined;
    }
  };

  const focusItem = (index: number): void => {
    const el = root?.querySelectorAll<HTMLElement>('[role="menuitem"]')[index];
    el?.focus();
  };

  const selectIndex = (index: number): void => {
    const item = props.items[index];
    if (!item || item.disabled) return;
    props.onSelect(item.id);
    props.onClose();
  };

  const onDocMouse = (event: MouseEvent): void => {
    if (!root) return;
    if (!root.contains(event.target as Node)) props.onClose();
  };

  const onDocKey = (event: KeyboardEvent): void => {
    const intent = menuKeyIntent(event.key, {
      focusIndex: focusIndex(),
      items: props.items,
      altKey: event.altKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
    });
    if (!intent) return;
    event.preventDefault();
    if (intent.type === "close") {
      clearTypeahead();
      props.onClose();
      return;
    }
    if (intent.type === "move") {
      setFocusIndex(intent.index);
      focusItem(intent.index);
      return;
    }
    if (intent.type === "select") {
      selectIndex(focusIndex());
      return;
    }
    const now = Date.now();
    typeaheadQuery = nextTypeaheadQuery(typeaheadQuery, intent.char, now - typeaheadAt);
    typeaheadAt = now;
    if (typeaheadTimer !== undefined) window.clearTimeout(typeaheadTimer);
    typeaheadTimer = window.setTimeout(clearTypeahead, MENU_TYPEAHEAD_WINDOW_MS);
    const matched = typeaheadMatchIndex(props.items, typeaheadQuery, focusIndex());
    if (matched === null) return;
    setFocusIndex(matched);
    focusItem(matched);
  };

  createEffect(() => {
    if (!props.open) {
      clearTypeahead();
      return;
    }
    const first = untrack(() => firstEnabledIndex(props.items));
    setFocusIndex(first);
    document.addEventListener("mousedown", onDocMouse);
    document.addEventListener("keydown", onDocKey);
    queueMicrotask(() => focusItem(first));
    onCleanup(() => {
      document.removeEventListener("mousedown", onDocMouse);
      document.removeEventListener("keydown", onDocKey);
      clearTypeahead();
    });
  });

  createEffect(() => {
    if (!props.open || !props.onPlace) return;
    queueMicrotask(() => {
      if (!root) return;
      props.onPlace?.({ width: root.offsetWidth, height: root.offsetHeight });
    });
  });

  return (
    <YoPresence when={props.open} recipe="popover">
      <div
        ref={(el) => {
          root = el;
        }}
        class="yohu-context-menu"
        role="menu"
        style={{ left: `${props.x}px`, top: `${props.y}px` }}
      >
        <For each={props.items}>
          {(item, index) => {
            const attrs = () => menuItemHostAttrs(item, index() === focusIndex());
            return (
              <button
                type="button"
                role={attrs().role}
                class="yohu-context-menu__item yohu-interactive yohu-focus-ring--inset"
                data-tone={attrs()["data-tone"]}
                data-slot={attrs()["data-slot"]}
                disabled={attrs().disabled}
                tabindex={attrs().tabindex}
                onClick={() => {
                  if (item.disabled) return;
                  props.onSelect(item.id);
                  props.onClose();
                }}
              >
                <span class="yohu-context-menu__slot" data-slot="label">
                  {item.label}
                </span>
              </button>
            );
          }}
        </For>
      </div>
    </YoPresence>
  );
}
