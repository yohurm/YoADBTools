/**
 * L2 DropSession：有设备且未挡模态时，enter/over 立即热。
 * over 不得把已有 dirName 刷成 null。热态 dest 与松手 dest 同一套清单下标 + 滚轴盒。
 * 禁止扫 DOM 行盒，禁止 elementFromPoint。scale 由调用方传入。
 */

import type { NativeDragDropEvent } from "@yohu/api";

export type DropSession = { hot: false } | { hot: true; dirName: string | null };

export const DROP_IDLE: DropSession = { hot: false };

export interface DropCommit {
  paths: string[];
  dirName: string | null;
}

export interface DropRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ListHitEntry {
  name: string;
  kind: string;
}

/** 虚拟清单命中空间：一次滚轴盒，不用扫每行。 */
export interface ListHitSpace {
  rect: DropRect;
  scrollTop: number;
  itemHeight: number;
}

export function cssPointFromPhysical(x: number, y: number, scale: number): { x: number; y: number } {
  const factor = scale > 0 ? scale : 1;
  return { x: x / factor, y: y / factor };
}

/** Windows / POSIX 本机路径取末段；目录尾部分隔符去掉。 */
export function localBaseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  if (!trimmed) return "";
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

export function rectOf(el: Element): DropRect {
  const box = el.getBoundingClientRect();
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
}

export function pointInRect(rect: DropRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function readListHitSpace(list: Element, itemHeight: number): ListHitSpace {
  return {
    rect: rectOf(list),
    scrollTop: list instanceof HTMLElement ? list.scrollTop : 0,
    itemHeight,
  };
}

/** 清单下标命中。行被虚拟化卸掉也能中。热态与松手 dest 都走这里。 */
export function destDirFromEntries(
  x: number,
  y: number,
  space: ListHitSpace,
  entries: readonly ListHitEntry[],
): string | null {
  if (space.itemHeight <= 0 || entries.length === 0 || !pointInRect(space.rect, x, y)) {
    return null;
  }
  const index = Math.floor((y - space.rect.top + space.scrollTop) / space.itemHeight);
  const entry = entries[index];
  if (entry == null || (entry.kind !== "dir" && entry.kind !== "symlink")) return null;
  return entry.name;
}

/** 热态只看设备与模态。不读点。 */
export function dropSessionForEvent(
  event: NativeDragDropEvent,
  ctx: { hasDevice: boolean; blocked: boolean },
): DropSession {
  if (event.type === "leave" || event.type === "drop" || !ctx.hasDevice || ctx.blocked) {
    return DROP_IDLE;
  }
  return { hot: true, dirName: null };
}

/** 已热则保住 dirName。禁止 over 把热态刷成 null 再等 rAF。 */
export function adoptDropSession(prev: DropSession, next: DropSession): DropSession {
  if (!next.hot) return DROP_IDLE;
  if (prev.hot) return prev;
  return next;
}

/** 只在命中变化时换对象，避免清单空转。 */
export function dropSessionWithDir(session: DropSession, dirName: string | null): DropSession {
  if (!session.hot) return session;
  if (session.dirName === dirName) return session;
  return { hot: true, dirName };
}

/** 松手 dest 与热态同一套下标。默认进当前目录；intoFolder 才 destDirFromEntries。 */
export function dropCommit(
  event: Extract<NativeDragDropEvent, { type: "drop" }>,
  ctx: {
    hasDevice: boolean;
    blocked: boolean;
    intoFolder: boolean;
    scale: number;
    space?: ListHitSpace;
    entries: readonly ListHitEntry[];
  },
): DropCommit | undefined {
  if (!ctx.hasDevice || ctx.blocked || event.paths.length === 0) return undefined;
  if (!ctx.intoFolder || !ctx.space) {
    return { paths: event.paths, dirName: null };
  }
  const css = cssPointFromPhysical(event.position.x, event.position.y, ctx.scale);
  return {
    paths: event.paths,
    dirName: destDirFromEntries(css.x, css.y, ctx.space, ctx.entries),
  };
}

/** 从已选行拖：拖已选项则带走全部选中；拖未选项则只带这一项。 */
export function namesForDrag(selected: readonly string[], dragName: string): string[] {
  if (selected.includes(dragName)) return [...selected];
  return [dragName];
}
