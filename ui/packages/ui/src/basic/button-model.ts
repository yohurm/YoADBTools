/**
 * 按钮领域模型（L2）。
 * 对照 HarmonyOS ButtonStyleMode × role × controlSize：
 *   emphasized / normal / textual × accent|neutral|danger × sm|md。
 * role 只有 NORMAL / ERROR；tone=danger 即 ERROR，其余是 NORMAL。
 * 没有 outlined、没有 success/warning 按钮档、不写 data-paint。
 * 不碰 DOM、不判定 disabled / loading。
 */

export type YoButtonStyle = "emphasized" | "normal" | "textual";
export type YoButtonTone = "accent" | "neutral" | "danger";
export type YoButtonSize = "sm" | "md";

export const BUTTON_STYLES = ["emphasized", "normal", "textual"] as const;
export const BUTTON_TONES = ["accent", "neutral", "danger"] as const;
export const BUTTON_SIZES = ["sm", "md"] as const;

export const DEFAULT_BUTTON_STYLE: YoButtonStyle = "emphasized";
export const DEFAULT_BUTTON_TONE: YoButtonTone = "accent";
export const DEFAULT_BUTTON_SIZE: YoButtonSize = "md";

export interface ButtonInput {
  buttonStyle?: YoButtonStyle;
  tone?: YoButtonTone;
  size?: YoButtonSize;
}

export interface ButtonSpec {
  buttonStyle: YoButtonStyle;
  tone: YoButtonTone;
  size: YoButtonSize;
}

/** 解析缺省。未写 buttonStyle/tone 即鸿蒙 EMPHASIZED + role NORMAL。 */
export function resolveButtonSpec(input: ButtonInput): ButtonSpec {
  return {
    buttonStyle: input.buttonStyle ?? DEFAULT_BUTTON_STYLE,
    tone: input.tone ?? DEFAULT_BUTTON_TONE,
    size: input.size ?? DEFAULT_BUTTON_SIZE,
  };
}
