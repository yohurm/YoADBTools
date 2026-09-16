/**
 * 徽章交互策略（L3）。
 * 宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import { resolveBadgeSpec, type BadgeInput, type YoBadgeTone } from "./badge-model";

export interface BadgeHostAttrs {
  "data-tone": YoBadgeTone;
  "aria-label": string;
}

export function badgeHostAttrs(input: BadgeInput): BadgeHostAttrs {
  const spec = resolveBadgeSpec(input);
  return {
    "data-tone": spec.tone,
    "aria-label": spec.text,
  };
}
