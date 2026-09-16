import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RemoteEntry } from "@yohu/api";

const mocks = vi.hoisted(() => ({
  filesList: vi.fn(async (_serial: string, _path: string): Promise<RemoteEntry[]> => []),
  filesPush: vi.fn(async (_req: { serial: string; local: string; remote: string }): Promise<number> => 4),
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  return {
    ...actual,
    filesList: mocks.filesList,
    filesPush: mocks.filesPush,
  };
});

import { listingStore } from "./listing";
import { createTransferStore } from "./transfers";

beforeEach(() => {
  mocks.filesList.mockReset();
  mocks.filesList.mockResolvedValue([]);
  mocks.filesPush.mockReset();
  mocks.filesPush.mockResolvedValue(4);
});

afterEach(() => {
  listingStore.bindSerial(null);
});

describe("传输坞开合", () => {
  it("toggleTransfers 翻转 transfersOpen", () => {
    const store = createTransferStore();
    expect(store.ui.transfersOpen).toBe(true);
    store.toggleTransfers();
    expect(store.ui.transfersOpen).toBe(false);
    store.toggleTransfers();
    expect(store.ui.transfersOpen).toBe(true);
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
