/**
 * 按钮领域模型（L2）。
 * 外形 × 语义色 × 尺寸是不变式；涂装名给视图当 data-paint。
 * 不碰 DOM、不判定 disabled / loading。
 */

export type YoButtonVariant = "solid" | "outlined" | "ghost";
export type YoButtonTone = "accent" | "neutral" | "danger" | "success" | "warning";
export type YoButtonSize = "sm" | "md";
/** tone = 语义色轴；inherit = 消费父级 `--yohu-button-ink` / `--yohu-button-fill`。 */
export type ButtonInkSource = "tone" | "inherit";

export const BUTTON_VARIANTS = ["solid", "outlined", "ghost"] as const;
export const BUTTON_TONES = ["accent", "neutral", "danger", "success", "warning"] as const;
export const BUTTON_SIZES = ["sm", "md"] as const;

export const DEFAULT_BUTTON_VARIANT: YoButtonVariant = "solid";
export const DEFAULT_BUTTON_TONE: YoButtonTone = "accent";
export const DEFAULT_BUTTON_SIZE: YoButtonSize = "md";
export const DEFAULT_BUTTON_INK: ButtonInkSource = "tone";

export interface ButtonInput {
  variant?: YoButtonVariant;
  tone?: YoButtonTone;
  size?: YoButtonSize;
  /** true = inherit 父级 ink/fill token */
  ink?: boolean;
  /** true = 铺满父级、自隐边框圆角 */
  flush?: boolean;
}

export interface ButtonSpec {
  variant: YoButtonVariant;
  tone: YoButtonTone;
  size: YoButtonSize;
  ink: ButtonInkSource;
  flush: boolean;
}

/**
 * 实心上墨：
 * - on：accent / danger，语义实底 + font_on
 * - tone：success / warning，鸿蒙 confirm/alert 中明度，软底 + 语义字
 * - neutral：次级实底，不是黑胶囊
 */
export type ButtonSolidInk = "on" | "tone" | "neutral";

export type ButtonPaintKind =
  | "solid-on"
  | "solid-tone"
  | "solid-neutral"
  | "outlined-neutral"
  | "outlined-tone"
  | "ghost-neutral"
  | "ghost-tone";

/** 解析缺省。未写 variant/tone 即今日主按钮。 */
export function resolveButtonSpec(input: ButtonInput): ButtonSpec {
  return {
    variant: input.variant ?? DEFAULT_BUTTON_VARIANT,
    tone: input.tone ?? DEFAULT_BUTTON_TONE,
    size: input.size ?? DEFAULT_BUTTON_SIZE,
    ink: input.ink ? "inherit" : DEFAULT_BUTTON_INK,
    flush: Boolean(input.flush),
  };
}

export function buttonSolidInk(tone: YoButtonTone): ButtonSolidInk {
  if (tone === "neutral") return "neutral";
  if (tone === "success" || tone === "warning") return "tone";
  return "on";
}

/** 15 格 variant×tone → 涂装。CSS 只消费这个名字，不重写鸿蒙规则。ink/flush 不进涂装轴。 */
export function buttonPaintKind(spec: Pick<ButtonSpec, "variant" | "tone">): ButtonPaintKind {
  if (spec.variant === "solid") {
    const ink = buttonSolidInk(spec.tone);
    if (ink === "on") return "solid-on";
    if (ink === "neutral") return "solid-neutral";
    return "solid-tone";
  }
  const edge = spec.tone === "neutral" ? "neutral" : "tone";
  return spec.variant === "outlined" ? `outlined-${edge}` : `ghost-${edge}`;
}
