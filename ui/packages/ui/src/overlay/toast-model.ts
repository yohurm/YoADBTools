/**
 * Toast 领域模型（L2）。
 * 文案 × 语义色是不变式；涂装名给视图当 data-tone。
 * 可附带明细 / 前导 / 进度 / 常驻；不碰 DOM、不维护队列 / 代际。
 */

export type ToastTone = "success" | "error" | "info";

/** 与 Button tone 对齐的涂装，CSS 只消费这些名字。 */
export type ToastPaintTone = "success" | "danger" | "accent";

export const TOAST_TONES = ["success", "error", "info"] as const;

export const DEFAULT_TOAST_TONE: ToastTone = "info";

export interface ToastProgress {
  value?: number;
  indeterminate?: boolean;
}

export interface ToastInput {
  text: string;
  tone?: ToastTone;
  /** 次行说明（传输态 / 失败分类）。 */
  detail?: string;
  /** 流内前导图标名。 */
  leading?: string;
  /** 常驻：不走停留定时器，直到 dismiss。 */
  sticky?: boolean;
  progress?: ToastProgress;
  /** 第三行元数据（字节 / 速度）。 */
  meta?: string;
  /** 用户点关闭时回调；自动停留出场不调。 */
  onDismiss?: () => void;
}

export interface ToastSpec {
  text: string;
  tone: ToastTone;
  detail: string;
  leading: string;
  sticky: boolean;
  progress?: ToastProgress;
  meta: string;
}

export interface ToastItem extends ToastSpec {
  /** 单调代际，永不复用 */
  id: number;
  /** Presence 开关：false 后播出场再从队列移除 */
  open: boolean;
  onDismiss?: () => void;
}

export interface ToastPatch {
  text?: string;
  tone?: ToastTone;
  detail?: string;
  leading?: string;
  sticky?: boolean;
  /** `null` 清进度。 */
  progress?: ToastProgress | null;
  meta?: string;
}

export function hasToastLeading(value: string): boolean {
  return value.length > 0;
}

export function hasToastDetail(value: string): boolean {
  return value.length > 0;
}

export function hasToastMeta(value: string): boolean {
  return value.length > 0;
}

export function hasToastProgress(progress: ToastProgress | undefined): boolean {
  return progress !== undefined;
}

/** 解析缺省。未写 tone 即 info。 */
export function resolveToastSpec(input: ToastInput): ToastSpec {
  return {
    text: input.text,
    tone: input.tone ?? DEFAULT_TOAST_TONE,
    detail: input.detail?.trim() ?? "",
    leading: input.leading?.trim() ?? "",
    sticky: Boolean(input.sticky),
    progress: input.progress,
    meta: input.meta?.trim() ?? "",
  };
}

export function applyToastPatch(item: ToastItem, patch: ToastPatch): ToastItem {
  const progress =
    patch.progress === null ? undefined : patch.progress !== undefined ? patch.progress : item.progress;
  return {
    ...item,
    text: patch.text ?? item.text,
    tone: patch.tone ?? item.tone,
    detail: patch.detail !== undefined ? patch.detail.trim() : item.detail,
    leading: patch.leading !== undefined ? patch.leading.trim() : item.leading,
    sticky: patch.sticky ?? item.sticky,
    progress,
    meta: patch.meta !== undefined ? patch.meta.trim() : item.meta,
  };
}

/** 公开 tone → Button 语义涂装。禁止再发明 info/error 色名。 */
export function toastPaintTone(tone: ToastTone): ToastPaintTone {
  if (tone === "error") return "danger";
  if (tone === "success") return "success";
  return "accent";
}
