/**
 * Toast 领域模型（L2）。
 * 文案 × 语义色是不变式；涂装名给视图当 data-tone。
 * 不碰 DOM、不维护队列 / 代际。
 */

export type ToastTone = "success" | "error" | "info";

/** 与 Button tone 对齐的涂装，CSS 只消费这些名字。 */
export type ToastPaintTone = "success" | "danger" | "accent";

export const TOAST_TONES = ["success", "error", "info"] as const;

export const DEFAULT_TOAST_TONE: ToastTone = "info";

export interface ToastInput {
  text: string;
  tone?: ToastTone;
}

export interface ToastSpec {
  text: string;
  tone: ToastTone;
}

export interface ToastItem {
  /** 单调代际，永不复用 */
  id: number;
  text: string;
  tone: ToastTone;
  /** Presence 开关：false 后播出场再从队列移除 */
  open: boolean;
}

/** 解析缺省。未写 tone 即 info。 */
export function resolveToastSpec(input: ToastInput): ToastSpec {
  return {
    text: input.text,
    tone: input.tone ?? DEFAULT_TOAST_TONE,
  };
}

/** 公开 tone → Button 语义涂装。禁止再发明 info/error 色名。 */
export function toastPaintTone(tone: ToastTone): ToastPaintTone {
  if (tone === "error") return "danger";
  if (tone === "success") return "success";
  return "accent";
}
