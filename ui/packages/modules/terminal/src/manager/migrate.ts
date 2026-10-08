/**
 * 命令管理迁移：把当前组的选区整批追加到另一组。
 * 不碰 DOM、不改选区。叠卡外形在 YoDragPile；落点在 migrate-place。
 */

import { entryIsBlock } from "@yohu/api";

import type { DraftEntry, DraftGroup } from "../draft";
import { draftRowTitle } from "./editor-target";

const MENU_PREFIX = "move:";

export interface MigrateFace {
  id: string;
  label: string;
  leading: "terminal" | "block";
}

export interface MigrateCarry {
  /** 第 0 张是抓起的那条，其余按清单顺序。预览只取前面几张。 */
  faces: MigrateFace[];
  count: number;
}

export interface MigratePoint {
  x: number;
  y: number;
}

/** 右键动作 id。组 id 原样接在前缀后。 */
export function migrateMenuId(groupId: string): `move:${string}` {
  return `${MENU_PREFIX}${groupId}`;
}

export function migrateMenuTarget(id: string): string | null {
  if (!id.startsWith(MENU_PREFIX)) return null;
  const target = id.slice(MENU_PREFIX.length);
  return target.length > 0 ? target : null;
}

/** 除源组以外的组，保持原顺序。 */
export function migrateDestinations<T extends { id: string }>(
  groups: readonly T[],
  sourceId: string | null,
): T[] {
  if (!sourceId) return [];
  return groups.filter((group) => group.id !== sourceId);
}

/** 位移达到臂距才算拖，避免把点选收成迁移。 */
export function migrateArmed(start: MigratePoint, now: MigratePoint, arm: number): boolean {
  const dx = now.x - start.x;
  const dy = now.y - start.y;
  return dx * dx + dy * dy >= arm * arm;
}

/** 命中必须是别的组。条目行、源组、空白都不是落点。 */
export function migrateDropId(
  groups: readonly { id: string }[],
  sourceId: string | null,
  hitId: string | null,
): string | null {
  if (!sourceId || !hitId || hitId === sourceId) return null;
  return groups.some((group) => group.id === hitId) ? hitId : null;
}

/** 清单顺序里第一条选中。右栏静置气泡用它当最前面一张。 */
export function migrateFrontId(
  entries: readonly { id: string }[],
  selected: ReadonlySet<string>,
): string | null {
  return entries.find((entry) => selected.has(entry.id))?.id ?? null;
}

function faceOf(entry: DraftEntry): MigrateFace {
  return {
    id: entry.id,
    label: draftRowTitle(entry.name),
    leading: entryIsBlock(entry) ? "block" : "terminal",
  };
}

/**
 * 预览按抓起的那条在前，其余保持清单顺序。
 * 扇开、一起回家，由 YoDragPile 决定。右栏不另摆一沓。
 */
export function migrateCarry(
  entries: readonly DraftEntry[],
  selected: ReadonlySet<string>,
  grabbedId: string,
): MigrateCarry | null {
  const chosen = entries.filter((entry) => selected.has(entry.id));
  const front = chosen.find((entry) => entry.id === grabbedId) ?? chosen[0];
  if (!front) return null;
  const rest = chosen.filter((entry) => entry.id !== front.id);
  const ordered = [front, ...rest];
  return { faces: ordered.map(faceOf), count: ordered.length };
}

/**
 * 所选按源组顺序追加到目标组末尾。
 * 同一组、空选、未知组、选区不在源组里，都不改。
 */
export function moveEntriesIntoGroup<T extends { id: string; entries: { id: string }[] }>(
  groups: readonly T[],
  sourceId: string,
  selectedIds: ReadonlySet<string>,
  targetId: string,
): { groups: T[]; moved: T["entries"] } | null {
  if (sourceId === targetId || selectedIds.size === 0) return null;
  const source = groups.find((group) => group.id === sourceId);
  const target = groups.find((group) => group.id === targetId);
  if (!source || !target) return null;
  const moved = source.entries.filter((entry) => selectedIds.has(entry.id));
  if (moved.length === 0) return null;
  const moving = new Set(moved.map((entry) => entry.id));
  return {
    groups: groups.map((group) => {
      if (group.id === sourceId) {
        return { ...group, entries: group.entries.filter((entry) => !moving.has(entry.id)) };
      }
      if (group.id === targetId) {
        return { ...group, entries: [...group.entries, ...moved] };
      }
      return group;
    }),
    moved,
  };
}

/** 两点是否还值得飞一段。重合就直接落草稿。 */
export function migrateShouldFly(from: MigratePoint, to: MigratePoint): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return dx * dx + dy * dy >= 1;
}
