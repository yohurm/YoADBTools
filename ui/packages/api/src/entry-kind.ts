/** wire `EntryKind` 的成员。能否当目录打开、用不用文件夹字形，不在这里。 */

export function entryIsDir(kind: string): boolean {
  return kind === "dir";
}

export function entryIsFile(kind: string): boolean {
  return kind === "file";
}

export function entryIsSymlink(kind: string): boolean {
  return kind === "symlink";
}
