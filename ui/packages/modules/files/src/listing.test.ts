import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { RemoteEntry } from "@yohu/api";

const mocks = vi.hoisted(() => ({
  filesList: vi.fn(async (_serial: string, _path: string): Promise<RemoteEntry[]> => []),
  filesDelete: vi.fn(async (_req: { serial: string; path: string }): Promise<void> => undefined),
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  return {
    ...actual,
    filesList: mocks.filesList,
    filesDelete: mocks.filesDelete,
  };
});

import { createListingStore, listingEntryFromWire } from "./listing";

function fileEntry(name: string): RemoteEntry {
  return { name, kind: "file", size: 1, permission: "-rw-r--r--" };
}

beforeEach(() => {
  mocks.filesList.mockReset();
  mocks.filesList.mockResolvedValue([]);
  mocks.filesDelete.mockReset();
  mocks.filesDelete.mockResolvedValue(undefined);
});

describe("listing 边界", () => {
  it("不 import transfers，enterDirectory 无 catch", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "listing.ts"), "utf8");
    expect(src).not.toContain("./transfers");
    expect(src).not.toContain("fileStore");
    expect(src).not.toContain("UiTransfer");
    const start = src.indexOf("async function enterDirectory");
    const next = src.indexOf("async function goUp");
    const body = src.slice(start, next);
    expect(body).not.toContain("try");
    expect(body).not.toContain("catch");
    expect(src.match(/resolveRemotePath\(/g)?.length).toBe(1);
  });

  it("listingEntryFromWire 丢掉 link_target，mtime 缺省为空串", () => {
    expect(
      listingEntryFromWire({
        name: "a",
        kind: "file",
        size: 2,
        permission: "-rw-r--r--",
        link_target: "/sdcard/b",
      }),
    ).toEqual({
      name: "a",
      kind: "file",
      size: 2,
      permission: "-rw-r--r--",
      mtime: "",
    });
  });
});

describe("清单世代", () => {
  it("bindSerial 同设备不重复 list", async () => {
    const store = createListingStore();
    store.bindSerial("S1");
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledTimes(1));
    store.bindSerial("S1");
    await Promise.resolve();
    expect(mocks.filesList).toHaveBeenCalledTimes(1);
  });

  it("attachView 在同设备切回时补一次 list", async () => {
    const store = createListingStore();
    store.bindSerial("S1");
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledTimes(1));
    store.detachView();
    store.attachView();
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledTimes(2));
  });

  it("过期世代不写入表", async () => {
    let releaseFirst!: (list: RemoteEntry[]) => void;
    mocks.filesList.mockImplementationOnce(
      () =>
        new Promise((resolveList) => {
          releaseFirst = resolveList;
        }),
    );
    mocks.filesList.mockResolvedValueOnce([fileEntry("later.txt")]);
    const store = createListingStore();
    store.bindSerial("S1");
    const refresh = store.refresh();
    releaseFirst([fileEntry("stale.txt")]);
    await refresh;
    expect(store.entries.map((e) => e.name)).toEqual(["later.txt"]);
  });
});

describe("goTo / detach fault", () => {
  it("安全根外只报错，不改当前路径", async () => {
    const store = createListingStore();
    expect(store.session.path).toBe("/sdcard");
    await expect(store.goTo("/data/local/tmp")).resolves.toBe(false);
    expect(store.session.path).toBe("/sdcard");
    expect(store.session.error).toBe("路径不在安全根内");
    expect(mocks.filesList).not.toHaveBeenCalled();
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
    const store = createListingStore();
    store.bindSerial("S1");
    await expect(store.goTo("/sdcard/Android/data/com.ggec")).resolves.toBe(false);
    expect(store.session.path).toBe("/sdcard");
    expect(store.session.error).toBe("没有这个目录，请重新输入");
    expect(store.session.error).not.toContain("退出码");
  });

  it("detachView 清 error 与 errorTick", async () => {
    const store = createListingStore();
    store.bindSerial("S1");
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledTimes(1));
    await store.goTo("/data/local/tmp");
    expect(store.session.errorTick).toBeGreaterThan(0);
    store.detachView();
    expect(store.session.error).toBe("");
    expect(store.session.errorTick).toBe(0);
  });
});

describe("删除乐观摘名", () => {
  it("removeMany 先摘名，IPC 返回前列表已无该项", async () => {
    mocks.filesList.mockResolvedValue([fileEntry("a.txt"), fileEntry("b.txt")]);
    const store = createListingStore();
    store.bindSerial("S1");
    await vi.waitFor(() => expect(store.entries.map((e) => e.name)).toEqual(["a.txt", "b.txt"]));

    let release!: () => void;
    mocks.filesDelete.mockImplementation(
      () =>
        new Promise((resolveDelete) => {
          release = resolveDelete;
        }),
    );
    mocks.filesList.mockResolvedValue([fileEntry("b.txt")]);

    const pending = store.removeMany(["a.txt"]);
    await vi.waitFor(() => expect(store.entries.map((e) => e.name)).toEqual(["b.txt"]));
    release();
    await pending;
    expect(mocks.filesDelete).toHaveBeenCalledWith({ serial: "S1", path: "/sdcard/a.txt" });
    await vi.waitFor(() => expect(store.entries.map((e) => e.name)).toEqual(["b.txt"]));
  });

  it("removeMany 失败仍 list，并把错误写回 session", async () => {
    mocks.filesList.mockResolvedValue([fileEntry("a.txt")]);
    const store = createListingStore();
    store.bindSerial("S1");
    await vi.waitFor(() => expect(store.entries).toHaveLength(1));
    mocks.filesDelete.mockRejectedValue({ code: "adb_error", message: "设备忙" });
    mocks.filesList.mockResolvedValue([fileEntry("a.txt")]);
    await store.removeMany(["a.txt"]);
    expect(store.session.error).toBe("a.txt: 设备忙");
    expect(mocks.filesList.mock.calls.length).toBeGreaterThan(1);
  });
});
