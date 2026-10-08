/**
 * 进度条交互策略（L3）。
 * 宿主 aria / data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import {
  progressIsIndeterminate,
  progressSizeIsSm,
  resolveProgressSize,
  resolveProgressSpec,
  type ProgressInput,
  type ProgressMode,
  type ProgressSize,
} from "./progress-model";

export interface ProgressHostAttrs {
  role: "progressbar";
  "aria-valuemin": 0;
  "aria-valuemax": 100;
  "aria-valuenow": number | undefined;
  "data-mode": ProgressMode;
  "data-size"?: ProgressSize;
}

export function progressHostAttrs(input: ProgressInput): ProgressHostAttrs {
  const spec = resolveProgressSpec(input);
  const size = resolveProgressSize(input.size);
  return {
    role: "progressbar",
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": progressIsIndeterminate(spec.mode) ? undefined : spec.value,
    "data-mode": spec.mode,
    ...(progressSizeIsSm(size) ? { "data-size": "sm" as const } : {}),
  };
}

/** 确定态才写宽度；不定态交给 CSS 扫动。 */
export function progressFillWidth(input: ProgressInput): string | undefined {
  const spec = resolveProgressSpec(input);
  if (progressIsIndeterminate(spec.mode)) return undefined;
  return `${spec.value}%`;
}
