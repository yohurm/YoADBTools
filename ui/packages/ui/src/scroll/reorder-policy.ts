/**
 * 列表换位策略（L3）。开合、提交、按键增量与条/浮层 attrs。
 * 不写色值、不画铬、不碰 JSX。
 */

import { isActionableTarget, isEditableTarget } from "../keymap/target";
import { moveIndexFromInsert, type ReorderSession } from "./reorder-model";

export function canReorderList(count: number): boolean {
  return count >= 2;
}

export function shouldAcceptReorderPointer(button: number, count: number): boolean {
  return button === 0 && canReorderList(count);
}

/** 变高列表行内可编辑/可激活控件不抢换位；定高 VirtualList 不走此过滤。 */
export function shouldBeginReorderFromTarget(target: EventTarget | null): boolean {
  if (isEditableTarget(target) || isActionableTarget(target)) return false;
  const el = target instanceof Element ? target : null;
  return el === null || el.closest("[data-no-reorder]") === null;
}

export function beginReorderSession(from: number, key: string | number): ReorderSession {
  return { from, insert: from, key };
}

export function moveReorderSession(session: ReorderSession, insert: number): ReorderSession {
  if (session.insert === insert) return session;
  return { from: session.from, insert, key: session.key };
}

export function commitReorderSession(session: ReorderSession): { from: number; to: number } | null {
  const to = moveIndexFromInsert(session.from, session.insert);
  if (to === null) return null;
  return { from: session.from, to };
}

export function isHomeInsert(session: ReorderSession): boolean {
  return moveIndexFromInsert(session.from, session.insert) === null;
}

export function previewDest(session: ReorderSession): number {
  return moveIndexFromInsert(session.from, session.insert) ?? session.from;
}

export function reorderBarAttrs(open: boolean, y: number): {
  "data-open": "" | undefined;
  style: { top: string };
} {
  return {
    "data-open": open ? "" : undefined,
    style: { top: `${y}px` },
  };
}

export function reorderOverlayAttrs(open: boolean, y: number, height: number): {
  "data-open": "" | undefined;
  style: { top: string; height: string };
} {
  return {
    "data-open": open ? "" : undefined,
    style: { top: `${y}px`, height: `${height}px` },
  };
}

/** Ctrl/Meta + ↑/↓ 换位；无修饰键不抢列表焦点移动。Escape 取消。 */
export function resolveReorderKeyDelta(key: string, withReorderMod: boolean): number | null {
  if (!withReorderMod) return null;
  if (key === "ArrowUp") return -1;
  if (key === "ArrowDown") return 1;
  return null;
}

/**
 * 键盘换位入口。两 L4 共用。
 * 非换位键 null；换位键但夹在两端 / 一项不够则 "noop"；否则 from→to。
 */
export function applyReorderKey(
  key: string,
  withReorderMod: boolean,
  index: number,
  count: number,
): { from: number; to: number } | "noop" | null {
  const delta = resolveReorderKeyDelta(key, withReorderMod);
  if (delta === null) return null;
  if (!canReorderList(count)) return "noop";
  const to = Math.max(0, Math.min(count - 1, index + delta));
  if (to === index) return "noop";
  return { from: index, to };
}

export function shouldCancelReorder(key: string): boolean {
  return key === "Escape";
}
