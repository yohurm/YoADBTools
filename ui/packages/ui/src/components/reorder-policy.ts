/**
 * 列表换位策略（L3）。开合、提交、按键增量与条/浮层 attrs。
 * 不写色值、不画铬、不碰 JSX。
 */

import { moveIndexFromInsert, type ReorderSession } from "./reorder-model";

export function canReorderList(count: number): boolean {
  return count >= 2;
}

export function shouldAcceptReorderPointer(button: number, count: number): boolean {
  return button === 0 && canReorderList(count);
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

export function shouldCancelReorder(key: string): boolean {
  return key === "Escape";
}
