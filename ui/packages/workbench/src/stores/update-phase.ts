/**
 * 应用内更新阶段。进度事件的 stage 是另一套；本文件只判本机阶段。
 */

export type UpdateApplyPhase = "idle" | "downloading" | "ready" | "applying";

export function updatePhaseIsIdle(phase: UpdateApplyPhase): boolean {
  return phase === "idle";
}

export function updatePhaseIsDownloading(phase: UpdateApplyPhase): boolean {
  return phase === "downloading";
}

export function updatePhaseIsReady(phase: UpdateApplyPhase): boolean {
  return phase === "ready";
}

export function updatePhaseIsApplying(phase: UpdateApplyPhase): boolean {
  return phase === "applying";
}

/** 发现新版本的对话框：未开始或正在下载。 */
export function updatePhaseShowsFound(phase: UpdateApplyPhase): boolean {
  return updatePhaseIsIdle(phase) || updatePhaseIsDownloading(phase);
}

/** 确认安装的对话框：包已就绪或正在覆盖安装。 */
export function updatePhaseShowsConfirm(phase: UpdateApplyPhase): boolean {
  return updatePhaseIsReady(phase) || updatePhaseIsApplying(phase);
}

/** 下载或安装进行中，不能再发起一次下载。 */
export function updatePhaseIsBusy(phase: UpdateApplyPhase): boolean {
  return updatePhaseIsDownloading(phase) || updatePhaseIsApplying(phase);
}
