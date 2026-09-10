/**
 * 进度条交互策略（L3）。
 * 宿主 aria / data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import { resolveProgressSpec, type ProgressInput, type ProgressMode } from "./progress-model";

export interface ProgressHostAttrs {
  role: "progressbar";
  "aria-valuemin": 0;
  "aria-valuemax": 100;
  "aria-valuenow": number | undefined;
  "data-mode": ProgressMode;
}

export function progressHostAttrs(input: ProgressInput): ProgressHostAttrs {
  const spec = resolveProgressSpec(input);
  return {
    role: "progressbar",
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": spec.mode === "indeterminate" ? undefined : spec.value,
    "data-mode": spec.mode,
  };
}

/** 确定态才写宽度；不定态交给 CSS 扫动。 */
export function progressFillWidth(input: ProgressInput): string | undefined {
  const spec = resolveProgressSpec(input);
  if (spec.mode === "indeterminate") return undefined;
  return `${spec.value}%`;
}
