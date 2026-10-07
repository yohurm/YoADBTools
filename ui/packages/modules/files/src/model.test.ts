/**
 * files/model.ts 展示层：排序 / 列尺 / 文件体积。单位算法在 @yohu/ui formatByteCount。路径规则在 @yohu/api。
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ENTRY_NAME_EMPTY, ENTRY_NAME_SEPARATOR, entryIsDir, entryIsFile, entryIsSymlink, invalidNameText, splitPath, validateEntryName } from "@yohu/api";

import {
  FILE_COLUMNS,
  childPath,
  defaultFileColWidths,
  fileColTemplate,
  fileColumnHeader,
  fileTypeLabel,
  entryOpensAsDir,
  entrySizeText,
  sortDirIsAsc,
  sortEntries,
  type ListingEntry,
} from "./model";

describe("model 零 IPC", () => {
  it("不认错码、不转导出 errorText", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "model.ts"), "utf8");
    expect(src).not.toContain("errorText");
    expect(src).not.toContain("ipcErrorCode");
    expect(src).not.toContain("isCancelledError");
    expect(src).not.toContain("isNotFoundError");
    expect(src).not.toContain("export { joinPath");
    expect(src).toContain("ListingEntry");
    expect(src).toContain("EntryKind");
    expect(src).not.toContain("ListingKind");
    expect(src).not.toContain("FileColAlign");
    expect(src).not.toContain('"start" | "end"');
    expect(src).not.toContain('"dir" | "file" | "symlink" | "other"');
    expect(src).not.toContain("fileCategory");
    expect(src).not.toContain("FileCategory");
    expect(src).not.toContain("RemoteEntry");
  });
});

describe("sortEntries", () => {
  const e = (
    name: string,
    kind: ListingEntry["kind"],
    extra: Partial<ListingEntry> = {},
  ): ListingEntry => ({
    name,
    kind,
    size: 0,
    permission: "-rw-r--r--",
    mtime: "",
    ...extra,
  });

  it("目录优先 + 名称升序", () => {
    expect(sortDirIsAsc("asc")).toBe(true);
    expect(sortDirIsAsc("desc")).toBe(false);
    const sorted = sortEntries([e("b.txt", "file"), e("Alarms", "dir"), e("a.txt", "file"), e("DCIM", "dir")]);
    expect(sorted.map((x) => x.name)).toEqual(["Alarms", "DCIM", "a.txt", "b.txt"]);
  });

  it("名称降序仍目录优先", () => {
    const sorted = sortEntries(
      [e("b.txt", "file"), e("Alarms", "dir"), e("a.txt", "file"), e("DCIM", "dir")],
      "name",
      "desc",
    );
    expect(sorted.map((x) => x.name)).toEqual(["DCIM", "Alarms", "b.txt", "a.txt"]);
  });

  it("按大小降序（文件组内）", () => {
    const sorted = sortEntries(
      [e("small.bin", "file", { size: 10 }), e("Dir", "dir", { size: 0 }), e("big.bin", "file", { size: 999 })],
      "size",
      "desc",
    );
    expect(sorted.map((x) => x.name)).toEqual(["Dir", "big.bin", "small.bin"]);
  });

  it("按修改时间升序，空时间置后", () => {
    const sorted = sortEntries(
      [
        e("new.txt", "file", { mtime: "2026-08-18 12:00:08" }),
        e("old.txt", "file", { mtime: "2026-01-01 08:00:03" }),
        e("none.txt", "file"),
      ],
      "mtime",
      "asc",
    );
    expect(sorted.map((x) => x.name)).toEqual(["old.txt", "new.txt", "none.txt"]);
  });

  it("按类型（扩展名）升序", () => {
    const sorted = sortEntries(
      [e("b.apk", "file"), e("a.txt", "file"), e("z", "file")],
      "type",
      "asc",
    );
    expect(sorted.map((x) => x.name)).toEqual(["b.apk", "a.txt", "z"]);
  });
});

describe("validateEntryName 产品文案", () => {
  it("拒绝空、穿越、分隔符", () => {
    expect(validateEntryName("")).toBe(invalidNameText(ENTRY_NAME_EMPTY));
    expect(validateEntryName("..")).toBe(invalidNameText(".."));
    expect(validateEntryName("a/b")).toBe(invalidNameText(ENTRY_NAME_SEPARATOR));
    expect(validateEntryName("ok.txt")).toBeNull();
  });

  it("childPath 拒绝非法名，避免拼出安全根", () => {
    expect(childPath("/sdcard", "")).toEqual({ ok: false, reason: invalidNameText(ENTRY_NAME_EMPTY) });
    expect(childPath("/sdcard", "..")).toEqual({ ok: false, reason: invalidNameText("..") });
    expect(childPath("/sdcard", "a.txt")).toEqual({ ok: true, path: "/sdcard/a.txt" });
  });
});

describe("splitPath（面包屑分段）", () => {
  it("多级路径分段", () => {
    expect(splitPath("/storage/emulated/0")).toEqual(["storage", "emulated", "0"]);
  });
  it("根路径为空段", () => {
    expect(splitPath("/")).toEqual([]);
    expect(splitPath("")).toEqual([]);
  });
  it("尾部斜杠不产生空段", () => {
    expect(splitPath("/sdcard/DCIM/")).toEqual(["sdcard", "DCIM"]);
  });
});

describe("fileColumnHeader", () => {
  it("列名和调宽句只认这一份", () => {
    expect(FILE_COLUMNS.map((col) => fileColumnHeader(col.key))).toEqual(["名称", "类型", "大小", "日期"]);
    expect(FILE_COLUMNS.map((col) => col.header)).toEqual(["名称", "类型", "大小", "日期"]);
    expect(FILE_COLUMNS.map((col) => col.resizeLabel)).toEqual([
      "调节名称列宽",
      "调节类型列宽",
      "调节大小列宽",
      "调节日期列宽",
    ]);
  });
});

describe("fileTypeLabel（类型列）", () => {
  it("目录/链接/扩展名/无扩展名", () => {
    const base = { size: 0, permission: "-rw-r--r--", mtime: "" };
    expect(fileTypeLabel({ ...base, name: "DCIM", kind: "dir" })).toBe("目录");
    expect(fileTypeLabel({ ...base, name: "link", kind: "symlink" })).toBe("链接");
    expect(fileTypeLabel({ ...base, name: "a.apk", kind: "file" })).toBe("APK");
    expect(fileTypeLabel({ ...base, name: "README", kind: "file" })).toBe("文件");
    expect(entryOpensAsDir("dir")).toBe(true);
    expect(entryOpensAsDir("symlink")).toBe(true);
    expect(entryOpensAsDir("file")).toBe(false);
    expect(entryOpensAsDir("other")).toBe(false);
    expect(entryIsDir("dir")).toBe(true);
    expect(entryIsDir("symlink")).toBe(false);
    expect(entryIsFile("file")).toBe(true);
    expect(entryIsFile("dir")).toBe(false);
    expect(entryIsSymlink("symlink")).toBe(true);
    expect(entrySizeText("file", 2048, "")).toBe("2.0 KB");
    expect(entrySizeText("dir", 4096, "")).toBe("");
    expect(entrySizeText("symlink", 0, "—")).toBe("—");
    const dir = dirname(fileURLToPath(import.meta.url));
    const table = readFileSync(resolve(dir, "FileTable.tsx"), "utf8");
    const preview = readFileSync(resolve(dir, "PreviewPane.tsx"), "utf8");
    expect(table).toContain("entrySizeText");
    expect(preview).toContain("entrySizeText");
    expect(table).not.toContain("formatByteCount");
    expect(table).not.toContain('"ascending" | "descending" | "none"');
    expect(preview).not.toContain("formatByteCount");
  });
});

describe("fileColTemplate", () => {
  it("前三列定宽，日期列吃剩余", () => {
    expect(fileColTemplate(defaultFileColWidths())).toBe("240px 72px 80px minmax(168px, 1fr)");
  });
});

describe("清单排序只写一处", () => {
  it("升序比较和文本序各只在 model", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const sources = readdirSync(dir).filter(
      (name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.includes(".test."),
    );
    for (const name of sources) {
      const text = readFileSync(join(dir, name), "utf8");
      const ascBody = name === "model.ts" ? text.replace('return dir === "asc"', "") : text;
      const textBody = name === "model.ts" ? ascBody.replace("a.localeCompare(b, \"en\", { sensitivity: \"base\" })", "") : text;
      expect(ascBody, name).not.toContain('=== "asc"');
      expect(textBody, name).not.toContain("localeCompare");
    }
  });
});

describe("进入目录与手势选择只写一处", () => {
  it("视图不再自己判断能不能进入，也不再自己改选择", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const sources = readdirSync(dir).filter(
      (name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.includes(".test."),
    );
    for (const name of sources) {
      let text = readFileSync(join(dir, name), "utf8");
      if (name === "listing.ts") text = text.replace("selectedSet().has(name)", "");
      if (name === "listing.ts") text = text.replace("return generation === 0", "");
      expect(text, name).not.toContain("entryOpensAsDir(current.kind)");
      expect(text, name).not.toContain("entry && entryOpensAsDir");
      expect(text, name).not.toContain('select(entry().name, "replace")');
      expect(text, name).not.toContain('select(entry.name, "replace")');
      expect(text, name).not.toContain("selectedSet().has");
      expect(text, name).not.toContain("generation === 0");
      expect(text, name).not.toContain("coreGeneration === 0");
    }
  });
});
