/**
 * 更新检查 store：检查 / 下载 / 覆盖安装。
 * 编排 @yohu/api（对应 core `yohu-update`）；View 只绑信号与对话框。
 *
 * 下载：`update.download` 立即返回，进度与终态经 `update/progress`（与文件传输 invoke+事件 同纪律）。
 */

import { createSignal } from "solid-js";

import {
  onUpdateProgress,
  updateCancel,
  updateCheck,
  updateDownload,
  updateInstall,
  updateOpen,
} from "@yohu/api";
import type { IpcError, RemoteUpdate, UpdateProgress } from "@yohu/api";

export type UpdateApplyPhase = "idle" | "downloading" | "ready" | "applying";

type DownloadWaiter = {
  resolve: () => void;
  reject: (reason: IpcError) => void;
};

export function createUpdateStore() {
  const [checking, setChecking] = createSignal(false);
  const [pending, setPending] = createSignal<RemoteUpdate | null>(null);
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [phase, setPhase] = createSignal<UpdateApplyPhase>("idle");
  const [progress, setProgress] = createSignal<UpdateProgress | null>(null);
  const [installerPath, setInstallerPath] = createSignal<string | null>(null);

  let downloadWaiter: DownloadWaiter | null = null;

  function bindIpc(): void {
    void onUpdateProgress((e) => {
      const current = phase();
      if (current === "applying") {
        if (e.stage === "applying") {
          setProgress({
            version: e.version,
            stage: e.stage,
            received_bytes: e.received_bytes,
            total_bytes: e.total_bytes,
            installer_path: e.installer_path,
            message: e.message,
          });
        }
        return;
      }
      if (current === "ready" && e.stage !== "applying" && e.stage !== "failed") {
        return;
      }

      if (e.stage === "failed") {
        setPhase("idle");
        setProgress(null);
        setInstallerPath(null);
        const waiter = downloadWaiter;
        downloadWaiter = null;
        waiter?.reject({
          code: "internal",
          message: e.message?.trim() || "下载失败",
        });
        return;
      }

      setProgress({
        version: e.version,
        stage: e.stage,
        received_bytes: e.received_bytes,
        total_bytes: e.total_bytes,
        installer_path: e.installer_path,
        message: e.message,
      });

      if (e.stage === "applying") {
        setPhase("applying");
        return;
      }

      if (e.stage === "downloading" || e.stage === "verifying") {
        if (current !== "applying" && current !== "ready") {
          setPhase("downloading");
        }
        return;
      }

      if (e.stage === "ready" && e.installer_path) {
        setInstallerPath(e.installer_path);
        setPhase("ready");
        const waiter = downloadWaiter;
        downloadWaiter = null;
        waiter?.resolve();
      }
    });
  }

  async function check(): Promise<RemoteUpdate> {
    setChecking(true);
    try {
      const result = await updateCheck();
      if (result.has_new_version) {
        setPending(result);
        setDialogOpen(true);
        setPhase("idle");
        setProgress(null);
        setInstallerPath(null);
      } else {
        setPending(null);
        setDialogOpen(false);
        setPhase("idle");
        setProgress(null);
        setInstallerPath(null);
      }
      return result;
    } finally {
      setChecking(false);
    }
  }

  function canApply(): boolean {
    const update = pending();
    return !!update?.installer_url;
  }

  function percent(): number {
    const p = progress();
    if (!p || p.total_bytes <= 0) return 0;
    return Math.min(100, Math.round((p.received_bytes / p.total_bytes) * 100));
  }

  async function download(): Promise<void> {
    const update = pending();
    const installerUrl = update?.installer_url;
    if (!update || !installerUrl) {
      const error: IpcError = { code: "invalid_args", message: "没有可下载的安装包" };
      throw error;
    }
    if (phase() === "downloading" || phase() === "applying") return;

    setPhase("downloading");
    setProgress({
      version: update.version,
      stage: "downloading",
      received_bytes: 0,
      total_bytes: update.size_bytes,
    });

    const done = new Promise<void>((resolve, reject) => {
      downloadWaiter = {
        resolve,
        reject: (reason) => reject(reason),
      };
    });

    try {
      await updateDownload({
        url: installerUrl,
        sha256: update.sha256,
        size_bytes: update.size_bytes,
        version: update.version,
      });
    } catch (e) {
      downloadWaiter = null;
      setPhase("idle");
      setProgress(null);
      setInstallerPath(null);
      throw e;
    }

    try {
      await done;
    } catch (e) {
      setPhase("idle");
      setProgress(null);
      setInstallerPath(null);
      throw e;
    }
  }

  async function install(): Promise<void> {
    const path = installerPath();
    if (!path) {
      const error: IpcError = { code: "invalid_args", message: "没有可安装的安装包" };
      throw error;
    }
    setPhase("applying");
    try {
      await updateInstall(path);
    } catch (e) {
      setPhase("ready");
      throw e;
    }
  }

  async function openDownload(): Promise<void> {
    const update = pending();
    if (!update) return;
    await updateOpen(update.page_url);
    close();
  }

  /** 关窗：停下载，不清载荷。出场后再 dismiss。 */
  function close(): void {
    if (phase() === "applying") return;
    if (phase() === "downloading") {
      void updateCancel();
    }
    setDialogOpen(false);
  }

  /** 清载荷。调用方在 onExitComplete 再调；关窗请走 close。 */
  function dismiss(): void {
    if (phase() === "applying") return;
    if (phase() === "downloading") {
      void updateCancel();
      downloadWaiter = null;
    }
    setPending(null);
    setDialogOpen(false);
    setPhase("idle");
    setProgress(null);
    setInstallerPath(null);
  }

  return {
    checking,
    pending,
    dialogOpen,
    phase,
    progress,
    installerPath,
    percent,
    canApply,
    check,
    download,
    install,
    openDownload,
    close,
    dismiss,
    bindIpc,
  };
}

export type UpdateStoreApi = ReturnType<typeof createUpdateStore>;
