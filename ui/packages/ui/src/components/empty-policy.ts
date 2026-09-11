/**
 * 空态交互策略（L3）。
 * 宿主 data-* 从模型快照组装。
 * 不写色值、不画铬、不做 Dialog。
 */

import { resolveEmptyStateSpec, type EmptyStateInput } from "./empty-model";

export interface EmptyStateHostAttrs {
  "data-has-icon": true | undefined;
  "data-has-action": true | undefined;
  "data-fill": true | undefined;
}

export function emptyStateHostAttrs(input: EmptyStateInput): EmptyStateHostAttrs {
  const spec = resolveEmptyStateSpec(input);
  return {
    "data-has-icon": spec.hasIcon ? true : undefined,
    "data-has-action": spec.hasAction ? true : undefined,
    "data-fill": spec.fill ? true : undefined,
  };
}
