/**
 * 保存截图的结果。
 * 会话 phase 的 failed 仍由 mirrorIsFailed 判定，不是这一份。
 */

export type MirrorScreenshotOutcome = "saved" | "cancelled" | "failed";

/** 已写入用户选定的路径。 */
export function screenshotOutcomeIsSaved(outcome: MirrorScreenshotOutcome): boolean {
  return outcome === "saved";
}

/** 选路径失败。取消不提示，是其余分支。 */
export function screenshotOutcomeIsFailed(outcome: MirrorScreenshotOutcome): boolean {
  return outcome === "failed";
}
