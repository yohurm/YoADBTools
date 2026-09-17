/**
 * 更新检查 store：检查 / 下载 / 覆盖安装。
 * 编排 @yohu/api（对应 core `yohu-update`）；View 只绑信号与对话框。
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

export function createUpdateStore() {
  const [checking, setChecking] = createSignal(false);
  const [pending, setPending] = createSignal<RemoteUpdate | null>(null);
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [phase, setPhase] = createSignal<UpdateApplyPhase>("idle");
  const [progress, setProgress] = createSignal<UpdateProgress | null>(null);
  const [installerPath, setInstallerPath] = createSignal<string | null>(null);

  function bindIpc(): void {
    void onUpdateProgress((e) => {
      setProgress({
        version: e.version,
        stage: e.stage,
        received_bytes: e.received_bytes,
        total_bytes: e.total_bytes,
      });
      if (e.stage === "applying") {
        setPhase("applying");
        return;
      }
      if (e.stage === "downloading" || e.stage === "verifying") {
        const current = phase();
        if (current !== "applying" && current !== "ready") {
          setPhase("downloading");
        }
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
    try {
      const downloaded = await updateDownload({
        url: installerUrl,
        sha256: update.sha256,
        size_bytes: update.size_bytes,
        version: update.version,
      });
      setInstallerPath(downloaded.path);
      setPhase("ready");
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
