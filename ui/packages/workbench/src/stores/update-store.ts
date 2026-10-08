/**
 * 更新检查 store：检查 / 下载 / 覆盖安装。
 * 编排 @yohu/api（对应 core `yohu-update`）；View 只绑信号与对话框。
 *
 * 通道：关于页打开时 `loadChannel` → `update.info`，一次，不进 hydrate。
 * 阶段只跟 `update/progress`。终态必达，下载进度可丢。
 * invoke 返回不把阶段写成下载中。正在安装时忽略非安装进度，仍是这一份阶段的门闩。
 */

import { createSignal } from "solid-js";

import {
  errorText,
  onUpdateProgress,
  updateCancel,
  updateCheck,
  updateDownload,
  updateInfo,
  updateInstall,
  updateOpen,
  updateStageIsApplying,
  updateStageIsFailed,
  updateStageIsReady,
  updateStageIsTransfer,
  YoLog,
} from "@yohu/api";
import type { IpcError, RemoteUpdate, UpdateChannelInfo, UpdateProgress } from "@yohu/api";
import { ratioPercent } from "@yohu/ui";

import {
  updatePhaseIsApplying,
  updatePhaseIsBusy,
  updatePhaseIsDownloading,
  updatePhaseIsReady,
  type UpdateApplyPhase,
} from "./update-phase";

type DownloadWaiter = {
  resolve: () => void;
  reject: (reason: IpcError) => void;
};

/** 进度总量为正才算已知。百分比、不确定进度条、字节文案都认这一把。发布包 size_bytes 不是这一把。 */
export function updateProgressHasTotal(
  progress: UpdateProgress | null | undefined,
): progress is UpdateProgress {
  return progress != null && progress.total_bytes > 0;
}

/** 检查结果里有可更新版本。「已是最新版本」提示不在这里。 */
export function updateHasNewVersion(result: RemoteUpdate): boolean {
  return result.has_new_version;
}

/** 有应用内安装包地址，才能下载。本机路径不是这一把。 */
export function updateOfferHasInstaller(
  update: RemoteUpdate | null | undefined,
): update is RemoteUpdate & { installer_url: string } {
  return typeof update?.installer_url === "string" && update.installer_url.length > 0;
}

/** 本机已有安装包路径。下载地址不是这一把。 */
export function updateHasInstallerPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.length > 0;
}

export function createUpdateStore() {
  const [checking, setChecking] = createSignal(false);
  const [pending, setPending] = createSignal<RemoteUpdate | null>(null);
  const [dialogOpen, setDialogOpen] = createSignal(false);
  function idlePhase() {
    return "idle" as const;
  }

  function markDownloading(): void {
    setPhase("downloading");
  }

  function markReady(): void {
    setPhase("ready");
  }

  function markApplying(): void {
    setPhase("applying");
  }

  function hideDialog(): void {
    setDialogOpen(false);
  }

  function clearWaiter(): void {
    downloadWaiter = null;
  }

  function readWaiter(): DownloadWaiter | null {
    return downloadWaiter;
  }

  function applyingNow(): boolean {
    return updatePhaseIsApplying(phase());
  }

  function downloadingNow(): boolean {
    return updatePhaseIsDownloading(phase());
  }

  function cancelTransfer(): void {
    void updateCancel();
  }

  function currentOffer(): RemoteUpdate | null {
    return pending();
  }

  function offerVersion(update: RemoteUpdate): string {
    return update.version;
  }

  function offerSize(update: RemoteUpdate): number {
    return update.size_bytes;
  }

  function eventInstaller(e: UpdateProgress): string | null | undefined {
    return e.installer_path;
  }

  function stageApplying(e: UpdateProgress): boolean {
    return updateStageIsApplying(e.stage);
  }

  function stageFailed(e: UpdateProgress): boolean {
    return updateStageIsFailed(e.stage);
  }

  function invalidArgs(message: string): IpcError {
    return { code: "invalid_args", message };
  }

  const [phase, setPhase] = createSignal<UpdateApplyPhase>(idlePhase());
  const [progress, setProgress] = createSignal<UpdateProgress | null>(null);
  const [installerPath, setInstallerPath] = createSignal<string | null>(null);
  const [channel, setChannel] = createSignal<UpdateChannelInfo | null>(null);

  let downloadWaiter: DownloadWaiter | null = null;

  function applyProgress(e: UpdateProgress): void {
    setProgress({
      version: e.version,
      stage: e.stage,
      received_bytes: e.received_bytes,
      total_bytes: e.total_bytes,
      installer_path: eventInstaller(e),
    });
  }

  /** 传输快照回到空闲。 */
  function clearTransfer(): void {
    setPhase(idlePhase());
    setProgress(null);
    setInstallerPath(null);
  }

  /** 没有可展示的更新。 */
  function clearOffer(): void {
    setPending(null);
    hideDialog();
    clearTransfer();
  }

  function bindIpc(): void {
    void onUpdateProgress((e) => {
      const current = phase();
      if (updatePhaseIsApplying(current)) {
        if (stageApplying(e)) applyProgress(e);
        return;
      }
      if (updatePhaseIsReady(current) && !stageApplying(e) && !stageFailed(e)) {
        return;
      }

      if (stageFailed(e)) {
        clearTransfer();
        const waiter = readWaiter();
        clearWaiter();
        if (e.error) waiter?.reject(e.error);
        return;
      }

      applyProgress(e);

      if (stageApplying(e)) {
        markApplying();
        return;
      }

      if (updateStageIsTransfer(e.stage)) {
        if (!updatePhaseIsApplying(current) && !updatePhaseIsReady(current)) {
          markDownloading();
        }
        return;
      }

      if (updateStageIsReady(e.stage) && updateHasInstallerPath(eventInstaller(e))) {
        setInstallerPath(eventInstaller(e));
        markReady();
        const waiter = readWaiter();
        clearWaiter();
        waiter?.resolve();
      }
    });
  }

  /** 关于页进入时读一次。调用方挂载时打，不在渲染里打，也不进 hydrate。 */
  async function loadChannel(): Promise<void> {
    try {
      setChannel(await updateInfo());
    } catch (e) {
      YoLog.warn("update", `读取更新通道失败 ${errorText(e)}`);
    }
  }

  async function check(): Promise<RemoteUpdate> {
    setChecking(true);
    try {
      const result = await updateCheck();
      if (updateHasNewVersion(result)) {
        setPending(result);
        setDialogOpen(true);
        clearTransfer();
      } else {
        clearOffer();
      }
      return result;
    } finally {
      setChecking(false);
    }
  }

  function canApply(): boolean {
    return updateOfferHasInstaller(currentOffer());
  }

  function percent(): number {
    const p = progress();
    if (!updateProgressHasTotal(p)) return 0;
    return Math.round(ratioPercent(p.received_bytes, p.total_bytes));
  }

  async function download(): Promise<void> {
    const update = currentOffer();
    if (!updateOfferHasInstaller(update)) {
      const error = invalidArgs("没有可下载的安装包");
      throw error;
    }
    const installerUrl = update.installer_url;
    if (updatePhaseIsBusy(phase()) || readWaiter()) return;

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
        size_bytes: offerSize(update),
        version: offerVersion(update),
      });
    } catch (e) {
      clearWaiter();
      clearTransfer();
      throw e;
    }

    try {
      await done;
    } catch (e) {
      clearTransfer();
      throw e;
    }
  }

  async function install(): Promise<void> {
    const path = installerPath();
    if (!updateHasInstallerPath(path)) {
      const error = invalidArgs("没有可安装的安装包");
      throw error;
    }
    markApplying();
    try {
      await updateInstall(path);
    } catch (e) {
      markReady();
      throw e;
    }
  }

  async function openDownload(): Promise<void> {
    const update = currentOffer();
    if (!update) return;
    await updateOpen(update.page_url);
    close();
  }

  /** 关窗：停下载，不清载荷。出场后再 dismiss。 */
  function close(): void {
    if (applyingNow()) return;
    if (downloadingNow()) {
      cancelTransfer();
    }
    hideDialog();
  }

  /** 清载荷。调用方在 onExitComplete 再调；关窗请走 close。 */
  function dismiss(): void {
    if (applyingNow()) return;
    if (downloadingNow()) {
      cancelTransfer();
      clearWaiter();
    }
    clearOffer();
  }

  return {
    checking,
    pending,
    dialogOpen,
    phase,
    progress,
    installerPath,
    channel,
    percent,
    canApply,
    loadChannel,
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
