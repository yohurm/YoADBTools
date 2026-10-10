/**
 * YoContextMenu —— 右键菜单 List 呈现（L4）。
 * 宽跟最长标签加菜单井与字槽，帽为 Layout.MenuMax；超帽省略。
 * 有子项的条目尾槽是 chevron；指针停上或向右展开二级菜单。
 * Host 管开合与落点；本组件管槽位与键盘。页面不要直接挂：走 defineContextMenu + openContextMenu。
 */
import { For, Show, createEffect, createSignal, onCleanup, untrack } from "solid-js";
import type { JSX } from "solid-js";
import type { YoMenuItem } from "./types";
import { menuItemDrawsRule, menuItemIsBranch, typeaheadMatchIndex } from "./menu-list-model";
import {
  MENU_TYPEAHEAD_WINDOW_MS,
  firstEnabledIndex,
  menuIntentIsAscend,
  menuIntentIsClose,
  menuIntentIsDescend,
  menuIntentIsMove,
  menuIntentIsSelect,
  menuItemHostAttrs,
  menuKeyIntent,
  nextTypeaheadQuery,
} from "./menu-key-policy";
import { itemIsEnabled } from "../keymap/list-index";
import { YoCorner } from "../corner";
import { presenceAttr } from "../dom/flag";
import "./menu-row.css";
import { Icon } from "../icons";
import { YoPresence } from "../motion/engines/presence";
import { readViewport } from "../placement/viewport";
import { Layout } from "../tokens/layout";
import { estimateContextMenuHeight, estimateContextMenuWidth, placeSubmenu } from "./place";
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
  let stack: HTMLDivElement | undefined;
  let menuEl: HTMLDivElement | undefined;
  let subEl: HTMLDivElement | undefined;
  const [focusIndex, setFocusIndex] = createSignal(0);
  const [subIndex, setSubIndex] = createSignal<number | null>(null);
  const [subFocus, setSubFocus] = createSignal(0);
  const [subKeyboard, setSubKeyboard] = createSignal(false);
  const [subPoint, setSubPoint] = createSignal({ x: 0, y: 0 });
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

  const dismissSubmenu = (): void => {
    setSubIndex(null);
    setSubKeyboard(false);
  };

  const focusItem = (index: number): void => {
    menuEl?.querySelectorAll<HTMLElement>('[role="menuitem"]')[index]?.focus();
  };

  const focusSubItem = (index: number): void => {
    subEl?.querySelectorAll<HTMLElement>('[role="menuitem"]')[index]?.focus();
  };

  function chooseItem(item: YoMenuItem | undefined): void {
    if (!itemIsEnabled(item)) return;
    props.onSelect(item.id);
    props.onClose();
  }

  const selectIndex = (index: number): void => {
    chooseItem(props.items[index]);
  };

  const branchAt = (index: number): YoMenuItem | undefined => {
    const item = props.items[index];
    return menuItemIsBranch(item) ? item : undefined;
  };

  const placeBranch = (index: number): void => {
    const item = branchAt(index);
    const anchor = menuEl?.querySelectorAll<HTMLElement>('[role="menuitem"]')[index]?.getBoundingClientRect();
    if (!item || !anchor) return;
    const labels = (item.children ?? []).map((child) => child.label);
    const viewport = readViewport();
    const estimated = {
      width: estimateContextMenuWidth(labels, viewport.width),
      height: estimateContextMenuHeight(labels.length),
    };
    setSubPoint(placeSubmenu(anchor, estimated, viewport));
    queueMicrotask(() => {
      if (!subEl) return;
      const box = menuEl?.querySelectorAll<HTMLElement>('[role="menuitem"]')[index]?.getBoundingClientRect();
      if (!box) return;
      setSubPoint(
        placeSubmenu(box, { width: subEl.offsetWidth, height: subEl.offsetHeight }, readViewport()),
      );
    });
  };

  const revealSubmenu = (index: number, keyboard: boolean): void => {
    if (!branchAt(index)) return;
    const first = firstEnabledIndex(props.items[index]?.children ?? []);
    setSubIndex(index);
    setSubFocus(first);
    setSubKeyboard(keyboard);
    placeBranch(index);
    if (keyboard) queueMicrotask(() => focusSubItem(first));
  };

  const onDocMouse = (event: MouseEvent): void => {
    if (!stack) return;
    if (!stack.contains(event.target as Node)) props.onClose();
  };

  const onDocKey = (event: KeyboardEvent): void => {
    const parent = subIndex();
    const inSub = subKeyboard() && parent !== null;
    const items = inSub ? (props.items[parent]?.children ?? []) : props.items;
    const focus = inSub ? subFocus() : focusIndex();
    const intent = menuKeyIntent(event.key, {
      focusIndex: focus,
      items,
      branch: menuItemIsBranch(items[focus]),
      submenuOpen: parent !== null,
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
    if (menuIntentIsDescend(intent)) {
      revealSubmenu(focusIndex(), true);
      return;
    }
    if (menuIntentIsAscend(intent)) {
      dismissSubmenu();
      focusItem(focusIndex());
      return;
    }
    if (menuIntentIsMove(intent)) {
      if (inSub) {
        setSubFocus(intent.index);
        focusSubItem(intent.index);
        return;
      }
      setFocusIndex(intent.index);
      if (parent !== null && parent !== intent.index) dismissSubmenu();
      focusItem(intent.index);
      return;
    }
    if (menuIntentIsSelect(intent)) {
      if (inSub && parent !== null) {
        const child = props.items[parent]?.children?.[subFocus()];
        if (child) chooseItem(child);
        return;
      }
      selectIndex(focusIndex());
      return;
    }
    const now = Date.now();
    typeaheadQuery = nextTypeaheadQuery(typeaheadQuery, intent.char, now - typeaheadAt);
    typeaheadAt = now;
    if (typeaheadTimer !== undefined) window.clearTimeout(typeaheadTimer);
    typeaheadTimer = window.setTimeout(clearTypeahead, MENU_TYPEAHEAD_WINDOW_MS);
    const matched = typeaheadMatchIndex(items, typeaheadQuery, focus);
    if (matched === null) return;
    if (inSub) {
      setSubFocus(matched);
      focusSubItem(matched);
      return;
    }
    setFocusIndex(matched);
    focusItem(matched);
  };

  createEffect(() => {
    if (!props.open) {
      clearTypeahead();
      dismissSubmenu();
      return;
    }
    const first = untrack(() => firstEnabledIndex(props.items));
    setFocusIndex(first);
    dismissSubmenu();
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
      if (!menuEl) return;
      props.onPlace?.({ width: menuEl.offsetWidth, height: menuEl.offsetHeight });
    });
  });

  const submenu = (): YoMenuItem | undefined => branchAt(subIndex() ?? -1);

  return (
    <YoPresence when={props.open} recipe="popover">
      <div
        ref={(el) => {
          stack = el;
        }}
        class="yohu-context-menu-stack"
      >
        <div
          ref={(el) => {
            menuEl = el;
          }}
          class="yohu-context-menu"
          data-enter="rise"
          data-layer="root"
          role="menu"
          style={{ left: `${props.x}px`, top: `${props.y}px` }}
        >
          <YoCorner role="card" class="yohu-context-menu__chrome" overflow="auto">
            <div class="yohu-menu-well">
            <For each={props.items}>
              {(item, index) => {
                const attrs = () => menuItemHostAttrs(item, index() === focusIndex(), index() === subIndex());
                return (
                  <button
                    type="button"
                    role={attrs().role}
                    class="yohu-context-menu__item yohu-menu-row yohu-interactive yohu-focus-ring--inset"
                    classList={{ "yohu-interactive--active": index() === subIndex() }}
                    data-rule={presenceAttr(menuItemDrawsRule(index(), props.items.length))}
                    data-tone={attrs()["data-tone"]}
                    data-slot={attrs()["data-slot"]}
                    disabled={attrs().disabled}
                    tabindex={attrs().tabindex}
                    aria-haspopup={attrs()["aria-haspopup"]}
                    aria-expanded={attrs()["aria-expanded"]}
                    onPointerEnter={() => {
                      if (menuItemIsBranch(item)) {
                        revealSubmenu(index(), false);
                        return;
                      }
                      dismissSubmenu();
                    }}
                    onClick={() => {
                      if (menuItemIsBranch(item)) {
                        revealSubmenu(index(), false);
                        return;
                      }
                      chooseItem(item);
                    }}
                  >
                    <span class="yohu-context-menu__slot" data-slot="label">
                      {item.label}
                    </span>
                    <Show when={menuItemIsBranch(item)}>
                      <span class="yohu-context-menu__slot" data-slot="trail">
                        <Icon name="chevron-right" size={Layout.IconInline} />
                      </span>
                    </Show>
                  </button>
                );
              }}
            </For>
            </div>
          </YoCorner>
        </div>
        <Show when={submenu()}>
          {(parent) => (
            <div
              ref={(el) => {
                subEl = el;
              }}
              class="yohu-context-menu"
              data-enter="rise"
              data-layer="sub"
              role="menu"
              style={{ left: `${subPoint().x}px`, top: `${subPoint().y}px` }}
            >
              <YoCorner role="card" class="yohu-context-menu__chrome" overflow="auto">
                <div class="yohu-menu-well">
                <For each={parent().children ?? []}>
                  {(child, index) => {
                    const attrs = () => menuItemHostAttrs(child, subKeyboard() && index() === subFocus());
                    return (
                      <button
                        type="button"
                        role={attrs().role}
                        class="yohu-context-menu__item yohu-menu-row yohu-interactive yohu-focus-ring--inset"
                        data-rule={presenceAttr(menuItemDrawsRule(index(), parent().children?.length ?? 0))}
                        data-tone={attrs()["data-tone"]}
                        data-slot={attrs()["data-slot"]}
                        disabled={attrs().disabled}
                        tabindex={attrs().tabindex}
                        onClick={() => chooseItem(child)}
                      >
                        <span class="yohu-context-menu__slot" data-slot="label">
                          {child.label}
                        </span>
                      </button>
                    );
                  }}
                </For>
                </div>
              </YoCorner>
            </div>
          )}
        </Show>
      </div>
    </YoPresence>
  );
}
