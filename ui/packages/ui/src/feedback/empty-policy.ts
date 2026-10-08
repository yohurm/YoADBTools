/**
 * 空态交互策略（L3）。
 * 宿主 data-* 从模型快照组装。
 * 不写色值、不画铬、不做 Dialog。
 */
import { presenceAttr } from "../dom/flag";

import { emptySizeIsSm, resolveEmptyStateSpec, type EmptyStateInput } from "./empty-model";

export type { EmptyStateSize } from "./empty-model";

export interface EmptyStateHostAttrs {
  "data-has-icon": "" | undefined;
  "data-has-action": "" | undefined;
  "data-fill": "" | undefined;
  "data-size": "sm" | undefined;
}

/** 描述空串不算。视图只画这一份，不再看原始 prop。 */
export function emptyStateDescription(input: EmptyStateInput): string | undefined {
  return resolveEmptyStateSpec(input).description;
}

export function emptyStateHostAttrs(input: EmptyStateInput): EmptyStateHostAttrs {
  const spec = resolveEmptyStateSpec(input);
  return {
    "data-has-icon": presenceAttr(spec.hasIcon),
    "data-has-action": presenceAttr(spec.hasAction),
    "data-fill": presenceAttr(spec.fill),
    "data-size": emptySizeIsSm(spec.size) ? "sm" : undefined,
  };
}
