import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_BROWSE_ROOT, type BrowseAttach, type RemoteEntry } from "@yohu/api";

const mocks = vi.hoisted(() => ({
  filesList: vi.fn(async (_serial: string, _path: string, _generation: number): Promise<RemoteEntry[]> => []),
  filesDelete: vi.fn(async (_req: { serial: string; path: string }): Promise<void> => undefined),
  filesSessionAttach: vi.fn(async (serial: string): Promise<BrowseAttach> => ({
    serial,
    generation: 1,
    adopted: false,
  })),
  filesSessionDetach: vi.fn(async (_serial: string, _generation: number): Promise<void> => undefined),
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  return {
    ...actual,
    filesList: mocks.filesList,
    filesDelete: mocks.filesDelete,
    filesSessionAttach: mocks.filesSessionAttach,
    filesSessionDetach: mocks.filesSessionDetach,
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
  mocks.filesSessionAttach.mockReset();
  mocks.filesSessionAttach.mockImplementation(async (serial: string) => ({
    serial,
    generation: 1,
    adopted: false,
  }));
  mocks.filesSessionDetach.mockReset();
  mocks.filesSessionDetach.mockResolvedValue(undefined);
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
    await vi.waitFor(() => expect(mocks.filesSessionAttach).toHaveBeenCalledWith("S1"));
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledWith("S1", DEFAULT_BROWSE_ROOT, 1));
    store.bindSerial("S1");
    await Promise.resolve();
    expect(mocks.filesList).toHaveBeenCalledTimes(1);
    expect(mocks.filesSessionAttach).toHaveBeenCalledTimes(1);
  });

  it("attachView 在同设备切回时补一次 list", async () => {
    const store = createListingStore();
    store.bindSerial("S1");
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledWith("S1", DEFAULT_BROWSE_ROOT, 1));
    store.detachView();
    await vi.waitFor(() => expect(mocks.filesSessionDetach).toHaveBeenCalledWith("S1", 1));
    store.attachView();
    await vi.waitFor(() => expect(mocks.filesSessionAttach).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledTimes(2));
  });

  it("过期 attach 只 release 自己的世代，不 list", async () => {
    let releaseFirst!: (value: { serial: string; generation: number; adopted: boolean }) => void;
    mocks.filesSessionAttach.mockImplementationOnce(
      () =>
        new Promise((resolveAttach) => {
          releaseFirst = resolveAttach;
        }),
    );
    const store = createListingStore();
    store.bindSerial("S1");
    store.detachView();
    expect(mocks.filesSessionDetach).not.toHaveBeenCalled();
    releaseFirst({ serial: "S1", generation: 1, adopted: false });
    await vi.waitFor(() => expect(mocks.filesSessionDetach).toHaveBeenCalledWith("S1", 1));
    expect(mocks.filesSessionDetach).toHaveBeenCalledTimes(1);
    expect(mocks.filesList).not.toHaveBeenCalled();
  });

  it("过期 attach 的 release 不得带上更新一代", async () => {
    let releaseFirst!: (value: { serial: string; generation: number; adopted: boolean }) => void;
    mocks.filesSessionAttach.mockImplementationOnce(
      () =>
        new Promise((resolveAttach) => {
          releaseFirst = resolveAttach;
        }),
    );
    mocks.filesSessionAttach.mockImplementationOnce(async (serial: string) => ({
      serial,
      generation: 2,
      adopted: true,
    }));
    const store = createListingStore();
    store.bindSerial("S1");
    store.detachView();
    store.attachView();
    await vi.waitFor(() => expect(mocks.filesSessionAttach).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledWith("S1", DEFAULT_BROWSE_ROOT, 2));
    releaseFirst({ serial: "S1", generation: 1, adopted: false });
    await vi.waitFor(() => expect(mocks.filesSessionDetach).toHaveBeenCalledWith("S1", 1));
    expect(mocks.filesSessionDetach.mock.calls.every((call) => call[1] !== 2)).toBe(true);
    expect(mocks.filesList).toHaveBeenCalledTimes(1);
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
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledTimes(1));
    const refresh = store.refresh();
    releaseFirst([fileEntry("stale.txt")]);
    await refresh;
    expect(store.entries.map((e) => e.name)).toEqual(["later.txt"]);
  });

  it("attach 完成前导航不 invoke、不伪造 NotAttached", async () => {
    let releaseAttach!: (value: BrowseAttach) => void;
    mocks.filesSessionAttach.mockImplementationOnce(
      () =>
        new Promise((resolveAttach) => {
          releaseAttach = resolveAttach;
        }),
    );
    const store = createListingStore();
    store.bindSerial("S1");
    await store.navigate("/sdcard/DCIM");
    expect(mocks.filesList).not.toHaveBeenCalled();
    expect(store.session.error).toBe("");
    expect(store.session.errorTick).toBe(0);
    expect(store.session.path).toBe(DEFAULT_BROWSE_ROOT);
    releaseAttach({ serial: "S1", generation: 1, adopted: false });
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledWith("S1", DEFAULT_BROWSE_ROOT, 1));
  });

  it("list 使用 attach 返回的 generation", async () => {
    mocks.filesSessionAttach.mockImplementation(async (serial: string) => ({
      serial,
      generation: 7,
      adopted: false,
    }));
    const store = createListingStore();
    store.bindSerial("S1");
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledWith("S1", DEFAULT_BROWSE_ROOT, 7));
  });

  it("切设备作废在途 list，不把旧 NotAttached 画进新会话", async () => {
    let rejectFirst!: (reason: unknown) => void;
    mocks.filesList.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );
    mocks.filesSessionAttach.mockImplementation(async (serial: string) => ({
      serial,
      generation: serial === "S1" ? 1 : 2,
      adopted: false,
    }));
    const store = createListingStore();
    store.bindSerial("S1");
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledTimes(1));
    store.bindSerial("S2");
    rejectFirst({ code: "invalid_args", message: "浏览会话未打开" });
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledWith("S2", DEFAULT_BROWSE_ROOT, 2));
    expect(store.session.error).toBe("");
    expect(store.session.serial).toBe("S2");
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
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalledTimes(1));
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

describe("目录快照会话", () => {
  function dirEntry(name: string): RemoteEntry {
    return { name, kind: "dir", size: 4096, permission: "drwxr-xr-x" };
  }

  it("bind 无快照时 cold，有行之后进子目录不是 cold", async () => {
    mocks.filesList.mockImplementation(async (_serial, path) => {
      if (path === "/sdcard") return [dirEntry("DCIM")];
      return [fileEntry("shot.jpg")];
    });
    const store = createListingStore();
    store.bindSerial("S1");
    expect(store.session.cold).toBe(true);
    await vi.waitFor(() => expect(store.entries.map((e) => e.name)).toEqual(["DCIM"]));
    expect(store.session.cold).toBe(false);

    let release!: (list: RemoteEntry[]) => void;
    mocks.filesList.mockImplementationOnce(
      () =>
        new Promise((resolveList) => {
          release = resolveList;
        }),
    );
    const pending = store.enterDirectory("DCIM");
    expect(store.session.path).toBe("/sdcard/DCIM");
    expect(store.session.cold).toBe(false);
    expect(store.entries).toHaveLength(0);
    release([fileEntry("shot.jpg")]);
    await pending;
    expect(store.entries.map((e) => e.name)).toEqual(["shot.jpg"]);
  });

  it("上级命中快照时立刻画出，不等第二趟 list", async () => {
    mocks.filesList.mockImplementation(async (_serial, path) => {
      if (path === "/sdcard") return [dirEntry("DCIM")];
      return [fileEntry("shot.jpg")];
    });
    const store = createListingStore();
    store.bindSerial("S1");
    await vi.waitFor(() => expect(store.entries).toHaveLength(1));
    await store.enterDirectory("DCIM");
    expect(store.session.path).toBe("/sdcard/DCIM");

    let release!: (list: RemoteEntry[]) => void;
    mocks.filesList.mockImplementationOnce(
      () =>
        new Promise((resolveList) => {
          release = resolveList;
        }),
    );
    const pending = store.goUp();
    expect(store.session.path).toBe("/sdcard");
    expect(store.entries.map((e) => e.name)).toEqual(["DCIM"]);
    release([dirEntry("DCIM")]);
    await pending;
    expect(store.entries.map((e) => e.name)).toEqual(["DCIM"]);
  });
});
