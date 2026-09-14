/**
 * 可关闭气泡（L2）。
 * 语义色与 Badge 同一枚举；缺省 accent（过滤 Token）。
 * leading 与 dismiss 模式是不变式；不碰 DOM。
 * 关闭钮在流内（右上对齐），计入固有宽；禁止 absolute 画到写入盒 clip 外。
 */

import type { YoBadgeTone } from "./badge-model";

export type YoChipTone = YoBadgeTone;
export type YoChipDismiss = "always" | "hover";

export const CHIP_DISMISSES = ["always", "hover"] as const;

export const DEFAULT_CHIP_TONE: YoChipTone = "accent";
export const DEFAULT_CHIP_DISMISS: YoChipDismiss = "always";

export interface ChipInput {
  text: string;
  tone?: YoChipTone;
  leading?: unknown;
  dismiss?: string;
}

export interface ChipSpec {
  text: string;
  tone: YoChipTone;
  leading: boolean;
  dismiss: YoChipDismiss | null;
}

/** 空串 / null / false 不算占槽。 */
export function hasChipLeading(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return value.length > 0;
  return true;
}

export function resolveChipDismiss(input: { dismissible?: boolean; dismiss?: string }): YoChipDismiss | null {
  if (!input.dismissible) return null;
  if (input.dismiss === "hover") return "hover";
  return DEFAULT_CHIP_DISMISS;
}

export function resolveChipSpec(input: ChipInput & { dismissible?: boolean }): ChipSpec {
  return {
    text: input.text,
    tone: input.tone ?? DEFAULT_CHIP_TONE,
    leading: hasChipLeading(input.leading),
    dismiss: resolveChipDismiss(input),
  };
}
