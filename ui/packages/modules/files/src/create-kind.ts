/** 新建动作的标题、字段名和默认名。菜单和对话框共用标题，默认名只给输入框。 */

import { entryIsDir } from "@yohu/api";

export type CreateKind = "file" | "dir";

export function createKindTitle(kind: CreateKind): string {
  return entryIsDir(kind) ? "新建目录" : "新建文件";
}

export function createKindFieldLabel(kind: CreateKind): string {
  return entryIsDir(kind) ? "新目录名" : "新文件名";
}

export function createKindSeed(kind: CreateKind): string {
  return entryIsDir(kind) ? "新建文件夹" : "新建文件.txt";
}
