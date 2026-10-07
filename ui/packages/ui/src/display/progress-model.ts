/**
 * 进度条领域模型（L2）。
 * 确定态 0–100 与不定态是不变式。
 * 不碰 DOM、不写 aria。
 */

export type ProgressMode = "determinate" | "indeterminate";

/** 轨高。xs 是默认，不写 data-size。sm 才加高，调用方不得改 .yohu-progress 高度。 */
export type ProgressSize = "xs" | "sm";

export const DEFAULT_PROGRESS_SIZE: ProgressSize = "xs";

export interface ProgressInput {
  value?: number;
  indeterminate?: boolean;
  size?: ProgressSize;
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

/** 已完成量占总量的百分比，夹在 0–100。总量不是正数时为 0。 */
export function ratioPercent(part: number, total: number): number {
  if (!(total > 0) || !Number.isFinite(part)) return 0;
  return clampProgressValue((part / total) * 100);
}

export function resolveProgressSpec(input: ProgressInput): ProgressSpec {
  return {
    mode: input.indeterminate ? "indeterminate" : "determinate",
    value: clampProgressValue(input.value ?? 0),
  };
}

/** 不定态。现在值与填充宽度都认这一把。 */
export function progressIsIndeterminate(mode: ProgressMode): boolean {
  return mode === "indeterminate";
}

/** 非 sm 一律 xs。未知值不另开一档。缺省轨不写 data-size。 */
export function progressSizeIsSm(size: ProgressSize | undefined): boolean {
  return size === "sm";
}

export function resolveProgressSize(size: ProgressSize | undefined): ProgressSize {
  return progressSizeIsSm(size) ? "sm" : DEFAULT_PROGRESS_SIZE;
}
