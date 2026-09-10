/**
 * 区域加载交互策略（L3）。
 * 宿主 aria / data-* 从模型快照组装。
 * 不写色值、不画铬。控件内加载不走本策略。
 */

import { resolveLoadingSpec, type LoadingInput } from "./loading-model";

export interface LoadingHostAttrs {
  role: "status";
  "aria-busy": true;
  "aria-live": "polite";
  "data-cover": true | undefined;
}

export function loadingHostAttrs(input: LoadingInput): LoadingHostAttrs {
  const spec = resolveLoadingSpec(input);
  return {
    role: "status",
    "aria-busy": true,
    "aria-live": "polite",
    "data-cover": spec.cover ? true : undefined,
  };
}
