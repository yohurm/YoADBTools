/**
 * 区域加载交互策略（L3）。
 * 宿主 aria / data-* 从模型快照组装。
 * 不写色值、不画铬。控件内加载不走本策略。
 */
import { presenceAttr } from "../dom/flag";

import { resolveLoadingSpec, type LoadingInput } from "./loading-model";

export interface LoadingHostAttrs {
  role: "status";
  "aria-busy": true;
  "aria-live": "polite";
  "data-cover": "" | undefined;
  "data-fill": "" | undefined;
}

/** 描述空串不算。视图只画这一份，不再看原始 prop。 */
export function loadingDescription(input: LoadingInput): string | undefined {
  return resolveLoadingSpec(input).description;
}

export function loadingHostAttrs(input: LoadingInput): LoadingHostAttrs {
  const spec = resolveLoadingSpec(input);
  return {
    role: "status",
    "aria-busy": true,
    "aria-live": "polite",
    "data-cover": presenceAttr(spec.cover),
    "data-fill": presenceAttr(spec.fill),
  };
}
