/**
 * 徽章领域模型（L2）。
 * 语义色与 Button 同一枚举；缺省 neutral。
 * 不碰 DOM、不判定交互。
 */

export type YoBadgeTone = "accent" | "neutral" | "danger" | "success" | "warning";

export const BADGE_TONES = ["accent", "neutral", "danger", "success", "warning"] as const;

export const DEFAULT_BADGE_TONE: YoBadgeTone = "neutral";

export interface BadgeInput {
  text: string;
  tone?: YoBadgeTone;
}

export interface BadgeSpec {
  text: string;
  tone: YoBadgeTone;
}

/** 解析缺省。未写 tone 即中性胶囊。 */
export function resolveBadgeSpec(input: BadgeInput): BadgeSpec {
  return {
    text: input.text,
    tone: input.tone ?? DEFAULT_BADGE_TONE,
  };
}
