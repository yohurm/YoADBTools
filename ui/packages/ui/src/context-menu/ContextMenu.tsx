/**
 * YoContextMenu —— 右键菜单 List 呈现（L4）。
 * HarmonyOS 对照：Menu；电脑默认最小宽 224vp。
 * Host 管开合与落点；本组件管槽位与键盘。页面不要直接挂：走 defineContextMenu + openContextMenu。
 */
import { For, createEffect, createSignal, onCleanup, untrack } from "solid-js";
import type { JSX } from "solid-js";
import type { YoMenuItem } from "./types";
import { typeaheadMatchIndex } from "./menu-list-model";
import {
  MENU_TYPEAHEAD_WINDOW_MS,
  firstEnabledIndex,
  menuIntentIsClose,
  menuIntentIsMove,
  menuIntentIsSelect,
  menuItemHostAttrs,
  menuKeyIntent,
  nextTypeaheadQuery,
} from "./menu-key-policy";
import { itemIsEnabled } from "../keymap/list-index";
import { YoCorner } from "../corner";
import { YoPresence } from "../motion/engines/presence";
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

  function chooseItem(item: YoMenuItem): void {
    if (!itemIsEnabled(item)) return;
    props.onSelect(item.id);
    props.onClose();
  }

  const selectIndex = (index: number): void => {
    chooseItem(props.items[index]);
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
    if (menuIntentIsClose(intent)) {
      clearTypeahead();
      props.onClose();
      return;
    }
    if (menuIntentIsMove(intent)) {
      setFocusIndex(intent.index);
      focusItem(intent.index);
      return;
    }
    if (menuIntentIsSelect(intent)) {
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
    const listen = <K extends keyof DocumentEventMap>(
      type: K,
      handler: (event: DocumentEventMap[K]) => void,
    ): (() => void) => {
      document.addEventListener(type, handler);
      return () => document.removeEventListener(type, handler);
    };
    const stopMouse = listen("mousedown", onDocMouse);
    const stopKey = listen("keydown", onDocKey);
    queueMicrotask(() => focusItem(first));
    onCleanup(() => {
      stopMouse();
      stopKey();
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
        data-enter="rise"
        role="menu"
        style={{ left: `${props.x}px`, top: `${props.y}px` }}
      >
        <YoCorner role="control" class="yohu-context-menu__chrome" overflow="auto" pad="block-xs">
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
                  onClick={() => chooseItem(item)}
                >
                  <span class="yohu-context-menu__slot" data-slot="label">
                    {item.label}
                  </span>
                </button>
              );
            }}
          </For>
        </YoCorner>
      </div>
    </YoPresence>
  );
}
