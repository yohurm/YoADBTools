/**
 * 设置页更新对话框。检查/下载/安装走 updateStore；本文件只绑信号与 toast。
 * open 走 dialogOpen 开关；onClose 只 close，onExitComplete 再 dismiss 清载荷。
 */

import { Show, createMemo, type JSX } from "solid-js";

import { updateStageIsVerifying } from "@yohu/api";
import { YoButton, YoDialog, YoProgressBar, YoScroller, formatByteCount, type ToastTone } from "@yohu/ui";

import { deviceStore, settingsStore, updateStore } from "../stores";
import { updateProgressHasTotal } from "../stores/update-store";
import {
  updatePhaseIsApplying,
  updatePhaseIsDownloading,
  updatePhaseShowsConfirm,
  updatePhaseShowsFound,
} from "../stores/update-phase";

function progressTextClass(): string {
  return "yohu-settings__update-progress-text";
}

function updateMetaClass(): string {
  return "yohu-settings__update-meta";
}

export function UpdateDialogs(props: {
  show: (text: string, tone: ToastTone) => void;
}): JSX.Element {
  function pendingUpdate() {
    return updateStore.pending();
  }

  function pendingVersion(): string | undefined {
    return pendingUpdate()?.version;
  }

  function pendingInstallerName(): string | null | undefined {
    return pendingUpdate()?.installer_name;
  }

  function pendingDescription(): string | null | undefined {
    return pendingUpdate()?.description;
  }

  function currentPhase() {
    return updateStore.phase();
  }

  function dialogShown(): boolean {
    return updateStore.dialogOpen();
  }

  function showCaught(e: unknown): void {
    props.show(deviceStore.caughtText(e), settingsStore.errorTone());
  }

  const downloading = (): boolean => updatePhaseIsDownloading(currentPhase());
  const pendingBytes = (): number => pendingUpdate()?.size_bytes ?? 0;
  const applying = (): boolean => updatePhaseIsApplying(currentPhase());
  const downloadPct = createMemo(() => updateStore.percent());
  const downloadProgress = createMemo(() => updateStore.progress());
  const updateProgressTail = createMemo((): JSX.Element | undefined => {
    if (!downloading()) return undefined;
    const progress = downloadProgress();
    return (
      <div class="yohu-settings__update-progress yohu-settings__update-progress--pinned">
        <YoProgressBar
          size={settingsStore.smSize()}
          value={downloadPct()}
          indeterminate={!updateProgressHasTotal(progress)}
        />
        <p class={progressTextClass()}>
          {updateStageIsVerifying(progress?.stage)
            ? "正在校验安装包…"
            : updateProgressHasTotal(progress)
              ? `已下载 ${formatByteCount(progress.received_bytes)} / ${formatByteCount(progress.total_bytes)}`
              : "正在下载安装包…"}
        </p>
      </div>
    );
  });
  const foundOpen = (): boolean => dialogShown() && updatePhaseShowsFound(currentPhase());
  const confirmOpen = (): boolean => dialogShown() && updatePhaseShowsConfirm(currentPhase());

  const closeDialog = (): void => updateStore.close();
  const finishDialog = (): void => {
    if (dialogShown()) return;
    updateStore.dismiss();
  };

  const openDownload = async (): Promise<void> => {
    try {
      await updateStore.openDownload();
    } catch (e) {
      showCaught(e);
    }
  };

  const downloadUpdate = async (): Promise<void> => {
    try {
      await updateStore.download();
    } catch (e) {
      showCaught(e);
    }
  };

  const installUpdate = async (): Promise<void> => {
    try {
      await updateStore.install();
    } catch (e) {
      showCaught(e);
    }
  };

  return (
    <>
      <YoDialog
        open={foundOpen}
        title="发现新版本"
        onClose={closeDialog}
        onExitComplete={finishDialog}
        bodyTail={updateProgressTail()}
        bodyTailAlign={downloading() ? "stretch" : undefined}
        footer={
          <Show
            when={!downloading()}
            fallback={
              <YoButton buttonStyle={settingsStore.normalStyle()} tone={settingsStore.accentTone()} onClick={closeDialog}>
                取消
              </YoButton>
            }
          >
            <YoButton buttonStyle={settingsStore.normalStyle()} tone={settingsStore.accentTone()} onClick={closeDialog}>
              稍后
            </YoButton>
            <YoButton buttonStyle={settingsStore.normalStyle()} tone={settingsStore.neutralTone()} onClick={() => void openDownload()}>
              浏览器下载
            </YoButton>
            <Show when={updateStore.canApply()}>
              <YoButton onClick={() => void downloadUpdate()}>下载</YoButton>
            </Show>
          </Show>
        }
        >
        <YoScroller fade={downloading() ? "end" : undefined}>
          <p class="yohu-settings__update-ver">v{pendingVersion()}</p>
          <Show when={pendingInstallerName()}>
            <p class={updateMetaClass()}>{pendingInstallerName()}</p>
          </Show>
          <Show when={pendingBytes() > 0}>
            <p class={updateMetaClass()}>{formatByteCount(pendingBytes())}</p>
          </Show>
          <Show when={pendingDescription()}>
            <p class="yohu-settings__update-desc">{pendingDescription()}</p>
          </Show>
        </YoScroller>
      </YoDialog>

      <YoDialog
        open={confirmOpen}
        title="安装更新"
        onClose={closeDialog}
        onExitComplete={finishDialog}
        footer={
          <>
            <Show when={!applying()}>
              <YoButton buttonStyle={settingsStore.normalStyle()} tone={settingsStore.accentTone()} onClick={closeDialog}>
                取消
              </YoButton>
            </Show>
            <YoButton loading={applying()} disabled={applying()} onClick={() => void installUpdate()}>
              {applying()
                ? settingsStore.macosHost() || settingsStore.linuxHost()
                  ? "正在打开…"
                  : "正在安装…"
                : settingsStore.macosHost() || settingsStore.linuxHost()
                  ? "打开安装包"
                  : "安装并重启"}
            </YoButton>
          </>
        }
        >
        <YoScroller>
          <p class="yohu-settings__update-copy">
            {settingsStore.macosHost()
              ? `已下载 ${pendingVersion()}。将打开 DMG，请拖入应用程序文件夹。`
              : settingsStore.linuxHost()
                ? `已下载 ${pendingVersion()}。将打开 .deb 安装包，请用系统软件安装器完成安装。`
                : `已下载 ${pendingVersion()}。安装将关闭应用并覆盖当前版本，完成后自动启动。`}
          </p>
          <Show when={applying()}>
            <p class={progressTextClass()}>正在覆盖安装，应用即将重启…</p>
          </Show>
        </YoScroller>
      </YoDialog>
    </>
  );
}
