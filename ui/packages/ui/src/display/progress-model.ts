/**
 * 进度条领域模型（L2）。
 * 确定态 0–100 与不定态是不变式。
 * 不碰 DOM、不写 aria。
 */

export type ProgressMode = "determinate" | "indeterminate";

export interface ProgressInput {
  value?: number;
  indeterminate?: boolean;
}

export interface ProgressSpec {
  mode: ProgressMode;
  value: number;
}

/** 将进度值夹取到 0–100。NaN / 非有限数视为 0。 */
export function clampProgressValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function resolveProgressSpec(input: ProgressInput): ProgressSpec {
  return {
    mode: input.indeterminate ? "indeterminate" : "determinate",
    value: clampProgressValue(input.value ?? 0),
  };
}
