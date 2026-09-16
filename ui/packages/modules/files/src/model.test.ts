/**
 * files/model.ts 路径安全镜像：validateEntryName 与 core SafetyRoot::validate_entry_name
 * 共用同一套 testdata/entry_name.json 向量（布尔有效性），防止语义漂移。
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  childPath,
  defaultFileColWidths,
  fileColTemplate,
  fileTypeLabel,
  formatSize,
  joinPath,
  parentOf,
  parentWithinSafety,
  sortEntries,
  splitPath,
  validateEntryName,
  type ListingEntry,
} from "./model";

describe("validateEntryName（与 domain testdata/entry_name.json 同一套向量）", () => {
  const testdata = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../../core/yohu-domain/testdata/entry_name.json",
  );
  const fixture: { name: string; valid: boolean }[] = JSON.parse(readFileSync(testdata, "utf8")) as {
    name: string;
    valid: boolean;
  }[];

  it.each(fixture)("name=$name -> valid=$valid", (c) => {
    expect(validateEntryName(c.name) === null).toBe(c.valid);
  });
});

describe("model 零 IPC", () => {
  it("不认错码、不转导出 errorText", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "model.ts"), "utf8");
    expect(src).not.toContain("errorText");
    expect(src).not.toContain("ipcErrorCode");
    expect(src).not.toContain("isCancelledError");
    expect(src).not.toContain("isNotFoundError");
    expect(src).toContain("isWithinSafety");
    expect(src).toContain("ListingEntry");
    expect(src).not.toContain("fileCategory");
    expect(src).not.toContain("FileCategory");
    expect(src).not.toContain("RemoteEntry");
  });
});

describe("joinPath", () => {
  it("根目录拼接", () => {
    expect(joinPath("/", "DCIM")).toBe("/DCIM");
  });
  it("普通目录拼接（去尾斜杠）", () => {
    expect(joinPath("/sdcard/", "a")).toBe("/sdcard/a");
    expect(joinPath("/sdcard", "a")).toBe("/sdcard/a");
  });
});

describe("parentOf", () => {
  it("根目录无上级", () => {
    expect(parentOf("/")).toBeNull();
    expect(parentOf("/sdcard")).toBe("/");
  });
  it("多级返回上级", () => {
    expect(parentOf("/sdcard/DCIM/Camera")).toBe("/sdcard/DCIM");
    expect(parentOf("/sdcard/DCIM/")).toBe("/sdcard");
  });
});

describe("parentWithinSafety", () => {
  it("停在安全根，不逃到 /", () => {
    expect(parentWithinSafety("/sdcard")).toBeNull();
    expect(parentWithinSafety("/storage")).toBeNull();
    expect(parentWithinSafety("/sdcard/DCIM")).toBe("/sdcard");
    expect(parentWithinSafety("/storage/emulated/0")).toBe("/storage/emulated");
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
    expect(validateEntryName("")).toBe("名称为空");
    expect(validateEntryName("..")).toBe("..");
    expect(validateEntryName("a/b")).toBe("含路径分隔符");
    expect(validateEntryName("ok.txt")).toBeNull();
  });

  it("childPath 拒绝非法名，避免拼出安全根", () => {
    expect(() => childPath("/sdcard", "")).toThrow();
    expect(() => childPath("/sdcard", "..")).toThrow();
    expect(childPath("/sdcard", "a.txt")).toBe("/sdcard/a.txt");
  });
});

describe("formatSize", () => {
  it("B/KB/MB/GB 阶梯", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2.0 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatSize(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
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

describe("fileTypeLabel（类型列）", () => {
  it("目录/链接/扩展名/无扩展名", () => {
    const base = { size: 0, permission: "-rw-r--r--", mtime: "" };
    expect(fileTypeLabel({ ...base, name: "DCIM", kind: "dir" })).toBe("目录");
    expect(fileTypeLabel({ ...base, name: "link", kind: "symlink" })).toBe("链接");
    expect(fileTypeLabel({ ...base, name: "a.apk", kind: "file" })).toBe("APK");
    expect(fileTypeLabel({ ...base, name: "README", kind: "file" })).toBe("文件");
  });
});

describe("fileColTemplate", () => {
  it("前三列定宽，日期列吃剩余", () => {
    expect(fileColTemplate(defaultFileColWidths())).toBe("240px 72px 80px minmax(168px, 1fr)");
  });
});
