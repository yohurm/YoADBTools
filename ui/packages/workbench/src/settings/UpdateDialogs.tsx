/**
 * 设置页更新对话框。检查/下载/安装走 updateStore；本文件只绑信号与 toast。
 * open 走 dialogOpen 开关；onClose 只 close，onExitComplete 再 dismiss 清载荷。
 */

import { Show, type JSX } from "solid-js";

import { errorText } from "@yohu/api";
import { YoButton, YoDialog, YoProgressBar, YoScroller } from "@yohu/ui";

import { settingsStore, updateStore } from "../stores";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateDialogs(props: {
  show: (text: string, tone: "success" | "error") => void;
}): JSX.Element {
  const downloading = (): boolean => updateStore.phase() === "downloading";
  const applying = (): boolean => updateStore.phase() === "applying";
  const foundOpen = (): boolean => {
    const phase = updateStore.phase();
    return updateStore.dialogOpen() && (phase === "idle" || phase === "downloading");
  };
  const confirmOpen = (): boolean => {
    const phase = updateStore.phase();
    return updateStore.dialogOpen() && (phase === "ready" || phase === "applying");
  };

  const closeDialog = (): void => updateStore.close();
  const finishDialog = (): void => {
    if (updateStore.dialogOpen()) return;
    updateStore.dismiss();
  };

  const openDownload = async (): Promise<void> => {
    try {
      await updateStore.openDownload();
    } catch (e) {
      props.show(`打开下载失败: ${errorText(e)}`, "error");
    }
  };

  const downloadUpdate = async (): Promise<void> => {
    try {
      await updateStore.download();
    } catch (e) {
      props.show(`下载失败: ${errorText(e)}`, "error");
    }
  };

  const installUpdate = async (): Promise<void> => {
    try {
      await updateStore.install();
    } catch (e) {
      props.show(`安装失败: ${errorText(e)}`, "error");
    }
  };

  return (
    <>
      <YoDialog
        open={foundOpen}
        title="发现新版本"
        onClose={closeDialog}
        onExitComplete={finishDialog}
        footer={
          <Show
            when={!downloading()}
            fallback={
              <YoButton variant="ghost" tone="accent" onClick={closeDialog}>
                取消
              </YoButton>
            }
          >
            <YoButton variant="ghost" tone="accent" onClick={closeDialog}>
              稍后
            </YoButton>
            <YoButton variant="ghost" tone="neutral" onClick={() => void openDownload()}>
              浏览器下载
            </YoButton>
            <Show when={updateStore.canApply()}>
              <YoButton onClick={() => void downloadUpdate()}>下载</YoButton>
            </Show>
          </Show>
        }
        >
        <YoScroller>
          <p class="yohu-settings__update-ver">{updateStore.pending()?.version}</p>
          <Show when={(updateStore.pending()?.size_bytes ?? 0) > 0}>
            <p class="yohu-settings__update-meta">{formatBytes(updateStore.pending()?.size_bytes ?? 0)}</p>
          </Show>
          <Show when={updateStore.pending()?.description}>
            <p class="yohu-settings__update-desc">{updateStore.pending()?.description}</p>
          </Show>
          <Show when={downloading()}>
            <div class="yohu-settings__update-progress">
              <YoProgressBar
                value={updateStore.percent()}
                indeterminate={(updateStore.progress()?.total_bytes ?? 0) <= 0}
              />
              <p class="yohu-settings__update-progress-text">
                {updateStore.progress()?.total_bytes
                  ? `已下载 ${formatBytes(updateStore.progress()?.received_bytes ?? 0)} / ${formatBytes(updateStore.progress()?.total_bytes ?? 0)}`
                  : "正在下载安装包…"}
              </p>
            </div>
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
              <YoButton variant="ghost" tone="accent" onClick={closeDialog}>
                取消
              </YoButton>
            </Show>
            <YoButton loading={applying()} disabled={applying()} onClick={() => void installUpdate()}>
              {applying()
                ? settingsStore.os() === "macos"
                  ? "正在打开…"
                  : "正在安装…"
                : settingsStore.os() === "macos"
                  ? "打开安装包"
                  : "安装并重启"}
            </YoButton>
          </>
        }
        >
        <YoScroller>
          <p class="yohu-settings__update-copy">
            {settingsStore.os() === "macos"
              ? `已下载 ${updateStore.pending()?.version}。将打开 DMG，请拖入应用程序文件夹。`
              : `已下载 ${updateStore.pending()?.version}。安装将关闭应用并覆盖当前版本，完成后自动启动。`}
          </p>
          <Show when={applying()}>
            <p class="yohu-settings__update-progress-text">正在覆盖安装，应用即将重启…</p>
          </Show>
        </YoScroller>
      </YoDialog>
    </>
  );
}
