/**
 * 菜单键盘策略（L3）。
 * Host 只管开合；List 消费本文件意图。不写坐标、不画条目。
 */

import { dismissKey, enabledIndexes, itemIsEnabled, listActivateKey, listEdgeKey, tabKey, verticalListDelta } from "../keymap/list-index";
import { motionDurationMs } from "../tokens/motion";
import {
  edgeEnabledIndex,
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

/** 关闭菜单。typeahead 是其余分支，不另判。 */
export function menuIntentIsClose(
  intent: MenuKeyIntent,
): intent is Extract<MenuKeyIntent, { type: "close" }> {
  return intent.type === "close";
}

/** 移动焦点。 */
export function menuIntentIsMove(
  intent: MenuKeyIntent,
): intent is Extract<MenuKeyIntent, { type: "move" }> {
  return intent.type === "move";
}

/** 激活当前项。 */
export function menuIntentIsSelect(
  intent: MenuKeyIntent,
): intent is Extract<MenuKeyIntent, { type: "select" }> {
  return intent.type === "select";
}

export interface MenuKeyInput {
  focusIndex: number;
  items: readonly MenuListItem[];
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

export function menuKeyIntent(key: string, input: MenuKeyInput): MenuKeyIntent | null {
  if (input.altKey || input.metaKey || input.ctrlKey) {
    if (dismissKey(key)) return { type: "close", reason: "escape" };
    return null;
  }
  const enabled = enabledIndexes(input.items);
  const delta = verticalListDelta(key);
  if (delta !== null) {
    const index = stepEnabledIndex(enabled, input.focusIndex, delta);
    return index === null ? null : { type: "move", index };
  }
  const edge = listEdgeKey(key);
  if (edge) {
    const index = edgeEnabledIndex(enabled, edge);
    return index === null ? null : { type: "move", index };
  }
  if (tabKey(key)) return { type: "close", reason: "tab" };
  if (dismissKey(key)) return { type: "close", reason: "escape" };
  if (listActivateKey(key)) return { type: "select" };
  if (key.length === 1) return { type: "typeahead", char: key };
  return null;
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
  const disabled = !itemIsEnabled(item);
  return {
    role: "menuitem",
    disabled,
    tabindex: focused && !disabled ? 0 : -1,
    "data-tone": item.danger ? "danger" : "neutral",
    "data-slot": "item",
  };
}

export function firstEnabledIndex(items: readonly MenuListItem[]): number {
  return enabledIndexes(items)[0] ?? 0;
}
