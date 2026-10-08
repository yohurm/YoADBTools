/** 库条目种类。导入预览叶子用同一份。队列里的自由行不是它。 */

import type { LibraryEntryKind } from "./types";

export function entryIsCommand<E extends { kind: string }>(
  entry: E,
): entry is Extract<E, { kind: Extract<LibraryEntryKind, "command"> }> {
  return entry.kind === "command";
}

export function entryIsBlock<E extends { kind: string }>(
  entry: E,
): entry is Extract<E, { kind: Extract<LibraryEntryKind, "block"> }> {
  return entry.kind === "block";
}
