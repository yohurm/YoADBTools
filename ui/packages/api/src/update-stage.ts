/**
 * `update/progress` 的 stage。本机应用阶段在 workbench `update-phase`，不在这里。
 */

import type { UpdateStage } from "./types";

export function updateStageIsDownloading(stage: UpdateStage | undefined): boolean {
  return stage === "downloading";
}

export function updateStageIsVerifying(stage: UpdateStage | undefined): boolean {
  return stage === "verifying";
}

export function updateStageIsReady(stage: UpdateStage | undefined): boolean {
  return stage === "ready";
}

export function updateStageIsApplying(stage: UpdateStage | undefined): boolean {
  return stage === "applying";
}

export function updateStageIsFailed(stage: UpdateStage | undefined): boolean {
  return stage === "failed";
}

/** 传字节或校验哈希。本机阶段都记成 downloading。 */
export function updateStageIsTransfer(stage: UpdateStage | undefined): boolean {
  return updateStageIsDownloading(stage) || updateStageIsVerifying(stage);
}
