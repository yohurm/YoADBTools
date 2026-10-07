import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateCheck: vi.fn(),
  updateDownload: vi.fn(),
  updateInstall: vi.fn(),
  updateCancel: vi.fn(),
  updateOpen: vi.fn(),
  onProgress: null as
    | ((e: {
        version: string;
        stage: string;
        received_bytes: number;
        total_bytes: number;
        error?: { code: string; message: string };
      }) => void)
    | null,
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  return {
    ...actual,
    onUpdateProgress: (handler: NonNullable<typeof mocks.onProgress>) => {
      mocks.onProgress = handler;
    },
    updateCancel: (...a: unknown[]) => mocks.updateCancel(...a),
    updateCheck: (...a: unknown[]) => mocks.updateCheck(...a),
    updateDownload: (...a: unknown[]) => mocks.updateDownload(...a),
    updateInstall: (...a: unknown[]) => mocks.updateInstall(...a),
    updateOpen: (...a: unknown[]) => mocks.updateOpen(...a),
  };
});

import {
  createUpdateStore,
  updateHasInstallerPath,
  updateHasNewVersion,
  updateOfferHasInstaller,
  updateProgressHasTotal,
} from "./update-store";

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

  it("失败事件原样拒绝 IPC 错误", async () => {
    mocks.updateCheck.mockResolvedValueOnce(FOUND);
    mocks.updateDownload.mockResolvedValueOnce(undefined);
    const store = createUpdateStore();
    store.bindIpc();
    await store.check();
    const pending = store.download();
    await vi.waitFor(() => expect(mocks.updateDownload).toHaveBeenCalled());
    mocks.onProgress?.({
      version: "1.2.0",
      stage: "failed",
      received_bytes: 0,
      total_bytes: 0,
      error: { code: "cancelled", message: "更新已取消" },
    });
    await expect(pending).rejects.toEqual({ code: "cancelled", message: "更新已取消" });
    expect(store.phase()).toBe("idle");
  });

  it("下载百分比取整并夹在 100", () => {
    const store = createUpdateStore();
    store.bindIpc();
    mocks.onProgress?.({
      version: "1.2.0",
      stage: "downloading",
      received_bytes: 1,
      total_bytes: 3,
    });
    expect(store.percent()).toBe(33);
    mocks.onProgress?.({
      version: "1.2.0",
      stage: "downloading",
      received_bytes: 500,
      total_bytes: 200,
    });
    expect(store.percent()).toBe(100);
  });

  it("总量为 0 时百分比是 0", () => {
    const store = createUpdateStore();
    store.bindIpc();
    mocks.onProgress?.({
      version: "1.2.0",
      stage: "downloading",
      received_bytes: 1,
      total_bytes: 0,
    });
    expect(store.percent()).toBe(0);
    expect(updateProgressHasTotal(null)).toBe(false);
    expect(
      updateProgressHasTotal({
        version: "1.2.0",
        stage: "downloading",
        received_bytes: 1,
        total_bytes: 0,
      }),
    ).toBe(false);
    expect(
      updateProgressHasTotal({
        version: "1.2.0",
        stage: "downloading",
        received_bytes: 1,
        total_bytes: 3,
      }),
    ).toBe(true);
  });
});

function productionSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...productionSources(path));
    else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.includes(".test.")
    ) {
      out.push(path);
    }
  }
  return out;
}

describe("更新要约只判一次", () => {
  it("新版本、下载地址、本机路径分开认", () => {
    expect(updateHasNewVersion(FOUND)).toBe(true);
    expect(updateHasNewVersion({ ...FOUND, has_new_version: false })).toBe(false);
    expect(updateOfferHasInstaller(null)).toBe(false);
    expect(updateOfferHasInstaller({ ...FOUND, installer_url: null })).toBe(false);
    expect(updateOfferHasInstaller({ ...FOUND, installer_url: "" })).toBe(false);
    expect(updateOfferHasInstaller(FOUND)).toBe(true);
    expect(updateHasInstallerPath(null)).toBe(false);
    expect(updateHasInstallerPath(undefined)).toBe(false);
    expect(updateHasInstallerPath("")).toBe(false);
    expect(updateHasInstallerPath("C:\\setup.exe")).toBe(true);
  });

  it("生产源不再自己比这三把", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const version = "return result.has_new_version;";
    const offer = 'return typeof update?.installer_url === "string" && update.installer_url.length > 0;';
    const localPath = 'return typeof path === "string" && path.length > 0;';
    for (const file of productionSources(root)) {
      let body = readFileSync(file, "utf8");
      if (file.endsWith("update-store.ts")) {
        body = body.replace(version, "").replace(offer, "").replace(localPath, "");
      }
      expect(body, file).not.toContain(".has_new_version");
      expect(body, file).not.toContain("?.installer_url");
      expect(body, file).not.toContain("&& e.installer_path");
      expect(body, file).not.toContain("if (!path)");
    }
  });
});

describe("更新快照只写一处", () => {
  it("总量比较和空闲清空不再散落", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const knownTotal = "return progress != null && progress.total_bytes > 0;";
    const idle = 'setPhase("idle");';
    const progressNull = "setProgress(null);";
    const installerNull = "setInstallerPath(null);";
    const pendingNull = "setPending(null);";
    for (const file of productionSources(root)) {
      let body = readFileSync(file, "utf8");
      if (file.endsWith("update-store.ts")) {
        body = body
          .replace(knownTotal, "")
          .replace(idle, "")
          .replace(progressNull, "")
          .replace(installerNull, "")
          .replace(pendingNull, "");
      }
      expect(body, file).not.toContain("total_bytes > 0");
      expect(body, file).not.toContain("total_bytes <=");
      expect(body, file).not.toContain("total_bytes ?");
      expect(body, file).not.toContain("?.total_bytes");
      expect(body, file).not.toContain(idle);
      expect(body, file).not.toContain(progressNull);
      expect(body, file).not.toContain(installerNull);
      expect(body, file).not.toContain(pendingNull);
    }
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
