import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowseAttach, RemoteEntry } from "@yohu/api";

const mocks = vi.hoisted(() => ({
  filesList: vi.fn(async (_serial: string, _path: string, _generation: number): Promise<RemoteEntry[]> => []),
  filesPush: vi.fn(async (_req: { serial: string; local: string; remote: string }): Promise<number> => 4),
  filesCancel: vi.fn(async (_id: number): Promise<void> => undefined),
  filesDragOut: vi.fn(async (_req: { serial: string; generation: number; items: { remote: string; is_dir: boolean; size: number }[] }): Promise<void> => undefined),
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
    filesPush: mocks.filesPush,
    filesCancel: mocks.filesCancel,
    filesDragOut: mocks.filesDragOut,
    filesSessionAttach: mocks.filesSessionAttach,
    filesSessionDetach: mocks.filesSessionDetach,
  };
});

import { listingStore } from "./listing";
import { createTransferStore } from "./transfers";

beforeEach(() => {
  mocks.filesList.mockReset();
  mocks.filesList.mockResolvedValue([]);
  mocks.filesPush.mockReset();
  mocks.filesPush.mockResolvedValue(4);
  mocks.filesCancel.mockReset();
  mocks.filesCancel.mockResolvedValue(undefined);
  mocks.filesDragOut.mockReset();
  mocks.filesDragOut.mockResolvedValue(undefined);
  mocks.filesSessionAttach.mockReset();
  mocks.filesSessionAttach.mockImplementation(async (serial: string) => ({
    serial,
    generation: 1,
    adopted: false,
  }));
});

afterEach(() => {
  listingStore.bindSerial(null);
});

describe("传输作业关闭", () => {
  it("dismiss 立即摘卡", async () => {
    listingStore.bindSerial("S1");
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalled());
    const store = createTransferStore();
    await store.push("C:/tmp/shot.png", "shot.png");
    expect(store.transfers).toHaveLength(1);
    store.dismiss(store.transfers[0]!.id);
    expect(store.transfers).toHaveLength(0);
    expect(mocks.filesCancel).toHaveBeenCalledWith(4);
  });
});

describe("传输作业出生", () => {
  it("push 发号后立刻用本机文件名建作业，不写 上传 #id", async () => {
    listingStore.bindSerial("S1");
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalled());
    const store = createTransferStore();
    await store.push("C:/tmp/shot.png", "shot.png");
    expect(mocks.filesPush).toHaveBeenCalledWith({
      serial: "S1",
      local: "C:/tmp/shot.png",
      remote: "/sdcard/shot.png",
    });
    expect(store.transfers).toHaveLength(1);
    expect(store.transfers[0]).toMatchObject({
      id: 4,
      direction: "push",
      name: "shot.png",
      state: "running",
    });
    expect(store.transfers[0]?.name).not.toMatch(/上传 #/);
  });
});

describe("拖出世代", () => {
  it("dragOut 把 listing 世代与清单条交给 filesDragOut", async () => {
    mocks.filesList.mockResolvedValue([
      { name: "a.txt", kind: "file", size: 3, permission: "-rw-r--r--" },
    ]);
    listingStore.bindSerial("S1");
    await vi.waitFor(() => expect(mocks.filesList).toHaveBeenCalled());
    const store = createTransferStore();
    await store.dragOut("a.txt");
    expect(mocks.filesDragOut).toHaveBeenCalledWith({
      serial: "S1",
      generation: 1,
      items: [{ remote: "/sdcard/a.txt", is_dir: false, size: 3 }],
    });
  });

  it("attach 完成前 dragOut 不 invoke", async () => {
    let releaseAttach!: (value: BrowseAttach) => void;
    mocks.filesSessionAttach.mockImplementationOnce(
      () =>
        new Promise((resolveAttach) => {
          releaseAttach = resolveAttach;
        }),
    );
    listingStore.bindSerial("S1");
    const store = createTransferStore();
    await store.dragOut("a.txt");
    expect(mocks.filesDragOut).not.toHaveBeenCalled();
    expect(listingStore.session.error).toBe("");
    releaseAttach({ serial: "S1", generation: 1, adopted: false });
  });
});
