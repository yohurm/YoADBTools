import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateCheck: vi.fn(),
  updateDownload: vi.fn(),
  updateInstall: vi.fn(),
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  return {
    ...actual,
    onUpdateProgress: vi.fn(),
    updateCancel: vi.fn(),
    updateCheck: (...a: unknown[]) => mocks.updateCheck(...a),
    updateDownload: (...a: unknown[]) => mocks.updateDownload(...a),
    updateInstall: (...a: unknown[]) => mocks.updateInstall(...a),
    updateOpen: vi.fn(),
  };
});

import { createUpdateStore } from "./update-store";

describe("createUpdateStore.download", () => {
  beforeEach(() => {
    mocks.updateCheck.mockReset();
    mocks.updateDownload.mockReset();
    mocks.updateInstall.mockReset();
  });

  it("没有 installer_url 时失败上抛", async () => {
    const store = createUpdateStore();
    await expect(store.download()).rejects.toMatchObject({
      code: "invalid_args",
      message: "没有可下载的安装包",
    });
    expect(mocks.updateDownload).not.toHaveBeenCalled();
  });

  it("仅有发布页时失败上抛", async () => {
    mocks.updateCheck.mockResolvedValueOnce({
      has_new_version: true,
      version: "1.2.0",
      description: "",
      installer_url: null,
      page_url: "https://github.com/o/r/releases/tag/v1.2.0",
      sha256: "",
      size_bytes: 0,
    });
    const store = createUpdateStore();
    await store.check();
    expect(store.canApply()).toBe(false);
    await expect(store.download()).rejects.toMatchObject({
      code: "invalid_args",
      message: "没有可下载的安装包",
    });
    expect(mocks.updateDownload).not.toHaveBeenCalled();
  });
});

describe("createUpdateStore.install", () => {
  beforeEach(() => {
    mocks.updateInstall.mockReset();
  });

  it("没有安装包路径时失败上抛", async () => {
    const store = createUpdateStore();
    await expect(store.install()).rejects.toMatchObject({
      code: "invalid_args",
      message: "没有可安装的安装包",
    });
    expect(mocks.updateInstall).not.toHaveBeenCalled();
  });
});
