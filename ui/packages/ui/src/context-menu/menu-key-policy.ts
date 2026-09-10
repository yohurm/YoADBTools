/**
 * 菜单键盘策略（L3）。
 * Host 只管开合；List 消费本文件意图。不写坐标、不画条目。
 */

import { motionDurationMs } from "../tokens/motion";
import {
  edgeEnabledIndex,
  enabledMenuIndexes,
  stepEnabledIndex,
  type MenuListItem,
} from "./menu-list-model";
import type { YoMenuItem } from "./types";

/** typeahead 累计窗口：跟 loop 时长 token，禁止自写 ms。 */
export const MENU_TYPEAHEAD_WINDOW_MS = motionDurationMs("loop");

export type MenuCloseReason = "escape" | "tab";

export type MenuKeyIntent =
  | { type: "close"; reason: MenuCloseReason }
  | { type: "move"; index: number }
  | { type: "select" }
  | { type: "typeahead"; char: string };

export interface MenuKeyInput {
  focusIndex: number;
  items: readonly MenuListItem[];
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

export function menuKeyIntent(key: string, input: MenuKeyInput): MenuKeyIntent | null {
  if (input.altKey || input.metaKey || input.ctrlKey) {
    if (key === "Escape") return { type: "close", reason: "escape" };
    return null;
  }
  const enabled = enabledMenuIndexes(input.items);
  switch (key) {
    case "Escape":
      return { type: "close", reason: "escape" };
    case "Tab":
      return { type: "close", reason: "tab" };
    case "ArrowDown": {
      const index = stepEnabledIndex(enabled, input.focusIndex, 1);
      return index === null ? null : { type: "move", index };
    }
    case "ArrowUp": {
      const index = stepEnabledIndex(enabled, input.focusIndex, -1);
      return index === null ? null : { type: "move", index };
    }
    case "Home": {
      const index = edgeEnabledIndex(enabled, "start");
      return index === null ? null : { type: "move", index };
    }
    case "End": {
      const index = edgeEnabledIndex(enabled, "end");
      return index === null ? null : { type: "move", index };
    }
    case "Enter":
    case " ":
      return { type: "select" };
    default:
      if (key.length === 1 && key !== " ") return { type: "typeahead", char: key };
      return null;
  }
}

export function nextTypeaheadQuery(
  prev: string,
  char: string,
  elapsedMs: number,
  windowMs: number = MENU_TYPEAHEAD_WINDOW_MS,
): string {
  return elapsedMs > windowMs ? char : `${prev}${char}`;
}

export type MenuItemTone = "neutral" | "danger";

export interface MenuItemHostAttrs {
  role: "menuitem";
  disabled: boolean;
  tabindex: 0 | -1;
  "data-tone": MenuItemTone;
  "data-slot": "item";
}

export function menuItemHostAttrs(item: YoMenuItem, focused: boolean): MenuItemHostAttrs {
  const disabled = Boolean(item.disabled);
  return {
    role: "menuitem",
    disabled,
    tabindex: focused && !disabled ? 0 : -1,
    "data-tone": item.danger ? "danger" : "neutral",
    "data-slot": "item",
  };
}

export function firstEnabledIndex(items: readonly MenuListItem[]): number {
  return enabledMenuIndexes(items)[0] ?? 0;
}
