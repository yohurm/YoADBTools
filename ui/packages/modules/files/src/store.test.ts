import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RemoteEntry } from "@yohu/api";

const mocks = vi.hoisted(() => ({
  filesList: vi.fn(async (_serial: string, _path: string): Promise<RemoteEntry[]> => []),
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  return { ...actual, filesList: mocks.filesList };
});

import {
  childPath,
  defaultFileColWidths,
  fileCategory,
  fileColTemplate,
  fileTypeLabel,
  formatSize,
  joinPath,
  parentOf,
  parentWithinSafety,
  sortEntries,
  splitPath,
  validateEntryName,
  isNotFoundError,
} from "./model";
import { createFileStore } from "./store";

beforeEach(() => {
  mocks.filesList.mockReset();
  mocks.filesList.mockResolvedValue([]);
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
    kind: RemoteEntry["kind"],
    extra: Partial<RemoteEntry> = {},
  ): RemoteEntry => ({
    name,
    kind,
    size: 0,
    permission: "-rw-r--r--",
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

describe("validateEntryName", () => {
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

describe("fileCategory（扩展名分类色）", () => {
  it("APK/AAB", () => {
    expect(fileCategory("app.apk")).toBe("apk");
    expect(fileCategory("bundle.AAB")).toBe("apk");
  });
  it("媒体", () => {
    expect(fileCategory("photo.PNG")).toBe("media");
    expect(fileCategory("movie.mp4")).toBe("media");
    expect(fileCategory("song.flac")).toBe("media");
  });
  it("文档", () => {
    expect(fileCategory("report.pdf")).toBe("doc");
    expect(fileCategory("data.json")).toBe("doc");
    expect(fileCategory("sys.log")).toBe("doc");
  });
  it("归档与其他", () => {
    expect(fileCategory("pack.zip")).toBe("archive");
    expect(fileCategory("unknown.xyz")).toBe("other");
    expect(fileCategory("noext")).toBe("other");
  });
});

describe("fileTypeLabel（类型列）", () => {
  it("目录/链接/扩展名/无扩展名", () => {
    const base = { size: 0, permission: "-rw-r--r--" };
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

describe("isNotFoundError", () => {
  it("识别 not_found 与「不存在」文案", () => {
    expect(isNotFoundError({ code: "not_found", message: "传输不存在: 3" })).toBe(true);
    expect(isNotFoundError("not found")).toBe(true);
    expect(isNotFoundError(new Error("其它错误"))).toBe(false);
  });
});

describe("goTo（自定义路径）", () => {
  it("安全根外不发起浏览", async () => {
    const store = createFileStore();
    await expect(store.goTo("/data/local/tmp")).resolves.toBe(false);
    expect(store.session.error).toBe("路径不在安全根内");
    expect(store.session.path).toBe("/sdcard");
  });
});

describe("goTo 走路径解析", () => {
  it("安全根外只报错，不改当前路径", async () => {
    const store = createFileStore();
    expect(store.session.path).toBe("/sdcard");
    await expect(store.goTo("/data/local/tmp")).resolves.toBe(false);
    expect(store.session.path).toBe("/sdcard");
    expect(store.session.error).toBe("路径不在安全根内");
  });

  it("设备上不存在的路径不跳转，文案不含 ls 退出码", async () => {
    mocks.filesList.mockImplementation(async (_serial, path) => {
      if (path.includes("com.ggec")) {
        throw {
          code: "not_found",
          message: "没有这个目录，请重新输入",
        };
      }
      return [];
    });
    const store = createFileStore();
    store.bindSerial("S1");
    await expect(store.goTo("/sdcard/Android/data/com.ggec")).resolves.toBe(false);
    expect(store.session.path).toBe("/sdcard");
    expect(store.session.error).toBe("没有这个目录，请重新输入");
    expect(store.session.error).not.toContain("退出码");
  });
});

describe("传输面板开合", () => {
  it("toggleTransfers 翻转 transfersOpen", () => {
    const store = createFileStore();
    expect(store.ui.transfersOpen).toBe(true);
    store.toggleTransfers();
    expect(store.ui.transfersOpen).toBe(false);
    store.toggleTransfers();
    expect(store.ui.transfersOpen).toBe(true);
  });
});
