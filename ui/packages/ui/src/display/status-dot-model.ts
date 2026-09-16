/**
 * 状态点领域模型（L2）。
 * 对照 HarmonyOS Badge 圆点标记：列表左侧 8×8vp，轻量、不写数字。
 * 设备在线 / 采集指示不是新事件数字标。
 * 不碰 DOM。
 */

export type YoStatusDotTone = "success" | "offline" | "accent" | "danger" | "warning" | "neutral";

export const STATUS_DOT_TONES = [
  "success",
  "offline",
  "accent",
  "danger",
  "warning",
  "neutral",
] as const;

export const DEFAULT_STATUS_DOT_TONE: YoStatusDotTone = "offline";

export interface StatusDotInput {
  tone?: YoStatusDotTone;
  label?: string;
}

export interface StatusDotSpec {
  tone: YoStatusDotTone;
  label: string | undefined;
}

export function resolveStatusDotSpec(input: StatusDotInput): StatusDotSpec {
  const label = input.label?.trim();
  return {
    tone: input.tone ?? DEFAULT_STATUS_DOT_TONE,
    label: label ? label : undefined,
  };
}
