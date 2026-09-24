import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateCheck: vi.fn(),
  updateDownload: vi.fn(),
  updateInstall: vi.fn(),
  updateCancel: vi.fn(),
  updateOpen: vi.fn(),
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  return {
    ...actual,
    onUpdateProgress: vi.fn(),
    updateCancel: (...a: unknown[]) => mocks.updateCancel(...a),
    updateCheck: (...a: unknown[]) => mocks.updateCheck(...a),
    updateDownload: (...a: unknown[]) => mocks.updateDownload(...a),
    updateInstall: (...a: unknown[]) => mocks.updateInstall(...a),
    updateOpen: (...a: unknown[]) => mocks.updateOpen(...a),
  };
});

import { createUpdateStore } from "./update-store";

const FOUND = {
  has_new_version: true,
  version: "1.2.0",
  description: "修复若干问题",
  installer_url: "https://example.com/setup.exe",
  installer_name: "setup.exe",
  page_url: "https://github.com/o/r/releases/tag/v1.2.0",
  sha256: "",
  size_bytes: 0,
};

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

describe("createUpdateStore.close / dismiss", () => {
  beforeEach(() => {
    mocks.updateCheck.mockReset();
    mocks.updateDownload.mockReset();
    mocks.updateCancel.mockReset();
    mocks.updateOpen.mockReset();
  });

  it("close 只关开关，pending 仍可读；dismiss 才清载荷", async () => {
    mocks.updateCheck.mockResolvedValueOnce(FOUND);
    const store = createUpdateStore();
    await store.check();
    expect(store.dialogOpen()).toBe(true);
    expect(store.pending()?.version).toBe("1.2.0");
    store.close();
    expect(store.dialogOpen()).toBe(false);
    expect(store.pending()?.version).toBe("1.2.0");
    expect(store.phase()).toBe("idle");
    store.dismiss();
    expect(store.pending()).toBeNull();
    expect(store.phase()).toBe("idle");
    expect(store.dialogOpen()).toBe(false);
  });

  it("下载中 close 停下载但不清 pending", async () => {
    mocks.updateCheck.mockResolvedValueOnce(FOUND);
    mocks.updateDownload.mockImplementation(() => new Promise(() => undefined));
    const store = createUpdateStore();
    await store.check();
    void store.download();
    expect(store.phase()).toBe("downloading");
    store.close();
    expect(mocks.updateCancel).toHaveBeenCalledTimes(1);
    expect(store.dialogOpen()).toBe(false);
    expect(store.pending()?.version).toBe("1.2.0");
    expect(store.phase()).toBe("downloading");
    store.dismiss();
    expect(store.pending()).toBeNull();
    expect(store.phase()).toBe("idle");
    expect(store.progress()).toBeNull();
  });

  it("浏览器下载只 close，dismiss 再清 pending", async () => {
    mocks.updateCheck.mockResolvedValueOnce(FOUND);
    mocks.updateOpen.mockResolvedValueOnce(undefined);
    const store = createUpdateStore();
    await store.check();
    await store.openDownload();
    expect(mocks.updateOpen).toHaveBeenCalledWith(FOUND.page_url);
    expect(store.dialogOpen()).toBe(false);
    expect(store.pending()?.version).toBe("1.2.0");
    store.dismiss();
    expect(store.pending()).toBeNull();
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
