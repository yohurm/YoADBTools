/**
 * 文件模块纯函数（View / store 之外）：路径 / 列 / ListingEntry。
 * 零 IPC。错码与文案只在 fault.ts。
 */

import {
  joinPath,
  validateEntryName,
  entryIsDir,
  entryIsFile,
  entryIsSymlink,
  type EntryKind,
} from "@yohu/api";
import { colTrackTemplate, defaultColWidths, formatByteCount, type YoColHeaderAlign, type YoColWidths } from "@yohu/ui";

/** 双击、回车和拖放落点都能进入。文件和其他种类不能。目录和链接的成员在 @yohu/api。 */
export function entryOpensAsDir(kind: string): boolean {
  return entryIsDir(kind) || entryIsSymlink(kind);
}

export interface ListingEntry {
  name: string;
  kind: EntryKind;
  size: number;
  permission: string;
  mtime: string;
}

export type ChildPathResult = { ok: true; path: string } | { ok: false; reason: string };

/** 非法名带回领域句，不抛 Error。只有通过校验才拼接。 */
export function childPath(dir: string, name: string): ChildPathResult {
  const reason = validateEntryName(name);
  if (reason) return { ok: false, reason };
  return { ok: true, path: joinPath(dir, name) };
}

export type SortKey = "name" | "type" | "size" | "mtime";
export type SortDir = "asc" | "desc";

/** 升序。符号、表头和点列换向都认这一把。 */
export function sortDirIsAsc(dir: SortDir): boolean {
  return dir === "asc";
}

/** 清单文本序。名称、类型和同键平局都用这一套。 */
function compareListingText(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}
/** 列规格（资源管理器详情列）：名称定宽截断，日期吃剩余。对齐用表头的 YoColHeaderAlign。 */
export interface FileColumnSpec {
  key: SortKey;
  header: string;
  resizeLabel: string;
  defaultWidth: number;
  minWidth: number;
  flex: boolean;
  align: YoColHeaderAlign;
}

const COLUMN_HEADER: Record<SortKey, string> = {
  name: "名称",
  type: "类型",
  size: "大小",
  mtime: "日期",
};

export function fileColumnHeader(key: SortKey): string {
  return COLUMN_HEADER[key];
}

function columnResizeLabel(key: SortKey): string {
  return `调节${fileColumnHeader(key)}列宽`;
}

export const FILE_COLUMNS: readonly FileColumnSpec[] = [
  {
    key: "name",
    header: fileColumnHeader("name"),
    resizeLabel: columnResizeLabel("name"),
    defaultWidth: 240,
    minWidth: 140,
    flex: false,
    align: "start",
  },
  {
    key: "type",
    header: fileColumnHeader("type"),
    resizeLabel: columnResizeLabel("type"),
    defaultWidth: 72,
    minWidth: 56,
    flex: false,
    align: "start",
  },
  {
    key: "size",
    header: fileColumnHeader("size"),
    resizeLabel: columnResizeLabel("size"),
    defaultWidth: 80,
    minWidth: 64,
    flex: false,
    align: "end",
  },
  {
    key: "mtime",
    header: fileColumnHeader("mtime"),
    resizeLabel: columnResizeLabel("mtime"),
    defaultWidth: 168,
    minWidth: 140,
    flex: true,
    align: "start",
  },
];

export function defaultFileColWidths(): YoColWidths {
  return defaultColWidths(FILE_COLUMNS);
}

export function fileColTemplate(widths: YoColWidths): string {
  return colTrackTemplate(FILE_COLUMNS, widths);
}

export const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  type: "asc",
  size: "desc",
  mtime: "desc",
};

export function sortEntries(
  entries: ListingEntry[],
  key: SortKey = "name",
  dir: SortDir = "asc",
): ListingEntry[] {
  const sign = sortDirIsAsc(dir) ? 1 : -1;
  return [...entries].sort((a, b) => {
    const kindRank = (k: ListingEntry["kind"]): number => (entryIsDir(k) ? 0 : 1);
    const rankDiff = kindRank(a.kind) - kindRank(b.kind);
    if (rankDiff !== 0) return rankDiff;
    const cmp = compareByKey(a, b, key);
    return cmp === 0 ? compareListingText(a.name, b.name) : cmp * sign;
  });
}

function compareByKey(a: ListingEntry, b: ListingEntry, key: SortKey): number {
  switch (key) {
    case "name":
      return compareListingText(a.name, b.name);
    case "type":
      return compareListingText(fileTypeLabel(a), fileTypeLabel(b));
    case "size":
      return a.size - b.size;
    case "mtime": {
      const am = a.mtime;
      const bm = b.mtime;
      if (am === bm) return 0;
      if (am === "") return 1;
      if (bm === "") return -1;
      return am < bm ? -1 : 1;
    }
  }
}

export function fileTypeLabel(entry: ListingEntry): string {
  if (entryIsDir(entry.kind)) return "目录";
  if (entryIsSymlink(entry.kind)) return "链接";
  const ext = entry.name.split(".").pop();
  if (ext && ext !== entry.name) return ext.toUpperCase();
  return "文件";
}

/** 只有文件有体积。清单留空，预览用破折号，由 blank 决定。单位算法在 formatByteCount。 */
export function entrySizeText(kind: string, size: number, blank: string): string {
  return entryIsFile(kind) ? formatByteCount(size) : blank;
}
